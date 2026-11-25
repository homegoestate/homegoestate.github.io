(() => {
  'use strict';

  // NOAA/Meeus solar coordinates and equation of time, with east-positive longitude.
  // https://gml.noaa.gov/grad/solcalc/calcdetails.html
  // https://gml.noaa.gov/grad/solcalc/solareqns.PDF
  const radians = Math.PI / 180;
  const taiwanOffset = 480;
  const horizon = -0.833 * radians; // Solar centre when the upper limb reaches a level horizon.
  const minuteMs = 60000;

  function numeric(value) {
    if (typeof value === 'number') return value;
    if (typeof value === 'string' && value.trim() !== '') return Number(value);
    return NaN;
  }

  function site(lat, lon, isoDate) {
    lat = numeric(lat);
    lon = numeric(lon);
    // Match the map's supported coordinate bounds, including its missing-coordinate cases.
    if (!(lat > 21 && lat < 26 && lon > 119 && lon < 122)) return null;
    if (typeof isoDate !== 'string' || !/^\d{4}-\d\d-\d\d$/.test(isoDate)) return null;
    const date = new Date(isoDate + 'T00:00:00.000Z');
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== isoDate) return null;
    return {
      lat: lat * radians,
      lon,
      // Julian date at midnight Taiwan standard time (UTC+8).
      julian: 2440587.5 + (date.getTime() / minuteMs - taiwanOffset) / 1440
    };
  }

  function orbit(place, minute) {
    const t = (place.julian + minute / 1440 - 2451545) / 36525;
    const meanLongitude = ((280.46646 + t * (36000.76983 + 0.0003032 * t)) % 360) * radians;
    const meanAnomaly = (357.52911 + t * (35999.05029 - 0.0001537 * t)) * radians;
    const eccentricity = 0.016708634 - t * (0.000042037 + 0.0000001267 * t);
    const centre = Math.sin(meanAnomaly) * (1.914602 - t * (0.004817 + 0.000014 * t))
      + Math.sin(2 * meanAnomaly) * (0.019993 - 0.000101 * t)
      + Math.sin(3 * meanAnomaly) * 0.000289;
    const node = (125.04 - 1934.136 * t) * radians;
    const apparentLongitude = meanLongitude + (centre - 0.00569 - 0.00478 * Math.sin(node)) * radians;
    const seconds = 21.448 - t * (46.815 + t * (0.00059 - t * 0.001813));
    const inclination = (23 + (26 + seconds / 60) / 60 + 0.00256 * Math.cos(node)) * radians;
    const declination = Math.asin(Math.sin(inclination) * Math.sin(apparentLongitude));
    const y = Math.tan(inclination / 2) ** 2;
    const equation = 4 / radians * (
      y * Math.sin(2 * meanLongitude) - 2 * eccentricity * Math.sin(meanAnomaly)
      + 4 * eccentricity * y * Math.sin(meanAnomaly) * Math.cos(2 * meanLongitude)
      - y * y / 2 * Math.sin(4 * meanLongitude)
      - 1.25 * eccentricity ** 2 * Math.sin(2 * meanAnomaly)
    );
    return { declination, transit: 720 + taiwanOffset - 4 * place.lon - equation };
  }

  function direction(place, minute) {
    const { declination, transit } = orbit(place, minute);
    const hour = (minute - transit) * radians / 4;
    const east = -Math.cos(declination) * Math.sin(hour);
    const north = Math.cos(place.lat) * Math.sin(declination)
      - Math.sin(place.lat) * Math.cos(declination) * Math.cos(hour);
    const up = Math.sin(place.lat) * Math.sin(declination)
      + Math.cos(place.lat) * Math.cos(declination) * Math.cos(hour);
    const horizontal = Math.hypot(east, north);
    return {
      azimuth: horizontal < 1e-12 ? null : (Math.atan2(east, north) / radians + 360) % 360,
      elevation: Math.atan2(up, horizontal) / radians
    };
  }

  // Re-evaluate declination and the equation of time at each event's own instant.
  function eventMinute(place, side) {
    let minute = 720 + side * 360;
    for (let step = 0; step < 3; step++) {
      const { declination, transit } = orbit(place, minute);
      const cosine = (Math.sin(horizon) - Math.sin(place.lat) * Math.sin(declination))
        / (Math.cos(place.lat) * Math.cos(declination));
      minute = transit + side * 4 * Math.acos(cosine) / radians;
    }
    return minute;
  }

  function clock(minute) {
    const value = Math.round(minute);
    return String(Math.floor(value / 60)).padStart(2, '0') + ':' + String(value % 60).padStart(2, '0');
  }

  function day(lat, lon, isoDate) {
    const place = site(lat, lon, isoDate);
    if (!place) return null;
    const rise = eventMinute(place, -1);
    const set = eventMinute(place, 1);
    return {
      sunrise: clock(rise),
      sunset: clock(set),
      sunriseAzimuth: direction(place, rise).azimuth,
      sunsetAzimuth: direction(place, set).azimuth,
      solarNoon: clock(eventMinute(place, 0)),
      daylightMinutes: Math.round(set) - Math.round(rise)
    };
  }

  function position(lat, lon, isoDate, time) {
    const place = site(lat, lon, isoDate);
    if (!place || typeof time !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) return null;
    const [hours, minutes] = time.split(':').map(Number);
    return direction(place, hours * 60 + minutes);
  }

  // A vertical window with a single, user-specified skyline angle across its front half.
  // Each minute is classified at its midpoint. Times mark the boundaries of those minutes.
  function exposure(lat, lon, isoDate, windowAzimuth, obstructionElevation) {
    const place = site(lat, lon, isoDate);
    const facing = numeric(windowAzimuth);
    const obstruction = numeric(obstructionElevation);
    if (!place || !(facing >= 0 && facing < 360 && obstruction >= 0 && obstruction <= 90)) return null;
    const rise = Math.round(eventMinute(place, -1));
    const set = Math.round(eventMinute(place, 1));
    const daylightMinutes = set - rise;
    const intervals = [];
    let start = null;
    let directMinutes = 0;
    for (let minute = rise; minute < set; minute++) {
      const sun = direction(place, minute + 0.5);
      const angle = (sun.azimuth - facing + 540) % 360 - 180;
      if (sun.azimuth !== null && Math.abs(angle) < 90 && sun.elevation > obstruction) {
        if (start === null) start = minute;
        directMinutes++;
      } else if (start !== null) {
        intervals.push({ start: clock(start), end: clock(minute) });
        start = null;
      }
    }
    if (start !== null) intervals.push({ start: clock(start), end: clock(set) });
    return { directMinutes, daylightMinutes, percent: directMinutes * 100 / daylightMinutes, intervals };
  }

  function today() {
    return new Date(Date.now() + taiwanOffset * minuteMs).toISOString().slice(0, 10);
  }

  window.MapSun = Object.freeze({ today, day, position, exposure });
})();
