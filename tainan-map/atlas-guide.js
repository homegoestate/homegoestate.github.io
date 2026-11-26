(() => {
  'use strict';
  const byId = id => document.getElementById(id);
  const number = new Intl.NumberFormat('zh-TW');
  const percent = new Intl.NumberFormat('zh-TW', {style:'percent', maximumFractionDigits:1});
  const format = value => number.format(value);

  function mount({districts, openPrices, showCity, mapDistrict, highlightPopulation}) {
    const tabs = [...document.querySelectorAll('[data-guide-task]')];
    const chooser = byId('populationDistrict');
    const heading = byId('populationCount');
    const subtitle = byId('populationCaption');
    const data = window.AtlasPopulation;
    const ranked = Object.entries(data?.districts || {}).sort((a,b) => a[1].rank - b[1].rank);
    let task = 'price', place = '', stories;

    function paintPopulation() {
      const current = data?.districts[place];
      chooser.value = current ? place : '';
      heading.textContent = data ? format(current ? current.population : data.total) : '資料待更新';
      subtitle.textContent = current ? place + ' · 全市第 ' + current.rank + ' 名 · 占 ' + percent.format(current.population / data.total) : '臺南市戶籍人口';
      byId('populationNext').hidden = !current;
      document.querySelectorAll('[data-population-place]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.populationPlace === place)));
    }
    function populateRanking() {
      if (!data || !ranked.length) return;
      const source = byId('populationSource');
      source.href = data.source.url;
      source.textContent = data.periodLabel + ' · 臺南市政府民政局 ↗';
      const list = byId('populationRanking'), rest = byId('populationRest');
      for (const [name, row] of ranked) {
        chooser.add(new Option(name, name));
        const item = document.createElement('li'), button = document.createElement('button');
        const rank = document.createElement('small'), title = document.createElement('span'), value = document.createElement('b');
        rank.textContent = String(row.rank).padStart(2,'0');
        title.textContent = name;
        value.textContent = format(row.population) + ' 人';
        button.type = 'button';
        button.dataset.populationPlace = name;
        button.style.setProperty('--share', (row.population / ranked[0][1].population * 100).toFixed(2) + '%');
        button.append(rank, title, value);
        button.addEventListener('click', () => {
          select('population', name);
          if (row.rank > 3) byId('guidePopulation').scrollIntoView({block:'start'});
        });
        item.append(button);
        (row.rank <= 3 ? list : rest).append(item);
      }
      chooser.onchange = () => select('population', chooser.value);
      byId('populationToPrices').onclick = () => select('price',place);
      byId('populationToStory').onclick = () => select('story',place);
    }
    function select(next, name = '', {fromMap = false} = {}) {
      if (!['price','population','story'].includes(next)) return;
      const previous = task;
      task = next;
      place = districts.includes(name) ? name : '';
      document.body.dataset.guide = task;
      tabs.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.guideTask === task)));
      byId('guidePopulation').hidden = task !== 'population';
      byId('guideStory').hidden = task !== 'story';
      if (task === 'price') {
        openPrices(place, fromMap);
      } else if (task === 'population') {
        if (!fromMap && previous !== task) showCity('population');
        paintPopulation();
        highlightPopulation(place);
      } else {
        const displayedDistrict = () => {
          const id = byId('guideStory').querySelector('[data-story-id]')?.dataset.storyId;
          return window.AtlasStories?.stories.find(story=>story.id===id)?.districts[0] || '';
        };
        if (!stories) {
          stories = window.AtlasStories?.mount(byId('guideStory'), {
            district:place,
            onDistrict:name => { place = name || displayedDistrict(); mapDistrict(place); },
            onCommunities:name => select('price',name),
            onLayer:layer => {
              if (!['fault','subsidence'].includes(layer)) return;
              showCity(layer);
              document.querySelector('.map-stage').scrollIntoView({block:'center'});
            }
          });
        } else stories.setDistrict(place);
        if (!fromMap) {place = place || displayedDistrict(); mapDistrict(place);}
      }
    }
    function pickDistrict(name) {
      if (task === 'price') return false;
      select(task,name);
      if (matchMedia('(max-width:900px)').matches) {
        byId(task === 'population' ? 'guidePopulation' : 'guideStory').scrollIntoView({block:'start'});
      }
      return true;
    }
    tabs.forEach(button => button.onclick = () => {
      if (button.dataset.guideTask !== task) select(button.dataset.guideTask, place);
    });
    populateRanking();
    return {
      select, pickDistrict,
      get task(){return task;},
      rememberDistrict(name){if (task === 'price') place = name;},
      layerChanged(layer) {
        if (layer === 'population' && task !== 'population') select('population',place,{fromMap:true});
        else if (layer !== 'population' && task === 'population') select('price','',{fromMap:true});
      }
    };
  }
  window.AtlasGuide = {mount};
})();
