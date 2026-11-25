/* North-up regional context for the community reference point. All lines are source geometry. */
(() => {
  'use strict';
  const kinds={cumulative:'累積下陷量',rate:'年平均速率',station:'固定測站'};
  const sources={cumulative:'https://data.gov.tw/dataset/58361',rate:'https://data.gov.tw/dataset/58362',station:'https://data.gov.tw/dataset/36694'};
  const faultSource='https://gsa.gsmma.gov.tw/gwh/gsb97-1/sys_2014b_pg/index.cfm';
  const validPoint=c=>Number(c.lon)>120 && Number(c.lon)<120.7 && Number(c.lat)>22.8 && Number(c.lat)<23.5;
  const approx=c=>['main','nearby'].includes(c.positionEstimated);
  const districtFeatures=()=>window.DISTRICT_GEOJSON?.features || [];
  function bounds(points){
    let left=Infinity,right=-Infinity,bottom=Infinity,top=-Infinity;
    for(const [x,y] of points){left=Math.min(x,left);right=Math.max(right,x);bottom=Math.min(bottom,y);top=Math.max(top,y);}
    return {left,right,bottom,top};
  }
  function makeMap(c,layer,kind,scope,esc){
    const point=validPoint(c)?[Number(c.lon),Number(c.lat)]:null;
    const width=560,height=330;
    const districts=districtFeatures().map(f=>({name:f.properties.name,polygons:f.geometry.type==='MultiPolygon'?f.geometry.coordinates:[f.geometry.coordinates]}));
    if(!districts.length)return '<p>行政區圖資暫時無法載入。</p>';
    const city=bounds(districts.flatMap(f=>f.polygons.flat(2)));
    const local=scope==='area' && point;
    const middle=local?point:[(city.left+city.right)/2,(city.bottom+city.top)/2];
    const lngKm=111.32*Math.cos(middle[1]*Math.PI/180),latKm=110.76;
    const scale=local ? width/17 : Math.min((width-42)/((city.right-city.left)*lngKm),(height-34)/((city.top-city.bottom)*latKm));
    const project=([x,y])=>[width/2+(x-middle[0])*lngKm*scale,height/2-(y-middle[1])*latKm*scale];
    function path(points,closed=false){
      return points.map((p,i)=>(i?'L':'M')+project(p).map(n=>n.toFixed(1)).join(' ')).join('')+(closed?'Z':'');
    }
    let shapes='', names='';
    for(const district of districts){
      const isHere=district.name===c.district;
      shapes+='<path d="'+district.polygons.map(p=>p.map(r=>path(r,true)).join('')).join('')+
        '" fill="'+(isHere?'#477066':'#30565b')+'" fill-rule="evenodd" stroke="#83aaa1" stroke-width=".7"/>';
      if(local || ['白河區','七股區','永康區','玉井區'].includes(district.name)){
        const box=bounds(district.polygons.flat(2)),[x,y]=project([(box.left+box.right)/2,(box.bottom+box.top)/2]);
        if(x>28 && x<width-28 && y>22 && y<height-22 && (!point || Math.hypot(x-project(point)[0],y-project(point)[1])>37))
          names+='<text x="'+x+'" y="'+y+'" text-anchor="middle" fill="#c8ded1" stroke="#30565b" stroke-width="3" paint-order="stroke" font-size="12">'+esc(district.name)+'</text>';
      }
    }
    const features=layer==='fault'?(window.MapFaults?.outlines || []).map(z=>({geometry:{type:'Polygon',coordinates:[z.ring]},properties:{label:z.name}})):
      (window.MapSubsidence?.features || []).filter(f=>f.properties.kind===kind);
    const overlay=features.map(f=>{
      const description=[f.properties.label,f.properties.period].filter(Boolean).join(' · ');
      const group=shape=>'<g data-geo-feature="" role="button" tabindex="0" aria-label="'+esc(description)+'"><title>'+esc(description)+'</title>'+shape+'</g>';
      const g=f.geometry;
      if(g.type==='Point'){
        const [x,y]=project(g.coordinates);
        return group('<circle cx="'+x+'" cy="'+y+'" r="12" fill="transparent"/><circle cx="'+x+'" cy="'+y+'" r="5.5" stroke="#12343d" stroke-width="2" fill="#85e7ff"/>');
      }
      const polygon=g.type==='Polygon';
      const lines=g.type==='LineString'?[g.coordinates]:g.coordinates;
      const value=Number(f.properties.value);
      const ink=polygon?'#ffa887':kind==='rate'?(value>=2?'#ffdc8b':value>=1?'#9be9e4':'#b7c2da'):(value>=30?'#ffe0a3':value>=20?'#93e8da':value>=10?'#7ad0f7':'#8caecf');
      const d=lines.map(l=>path(l,polygon)).join('');
      return group('<path d="'+d+'" stroke="transparent" fill="none" stroke-width="8"/><path d="'+d+'" stroke="'+ink+'" fill="'+(polygon?'#f28675':'none')+'" stroke-width="'+(polygon?1.7:1.9)+'" stroke-linejoin="round"/>');
    }).join('');
    let marker='';
    if(point){
      const [x,y]=project(point);
      marker='<g data-community-point=""><title>'+esc(c.name)+(approx(c)?' · 推估位置':' · 社區參考點')+'</title><circle cx="'+x+'" cy="'+y+'" r="9" fill="none" stroke="#ffdf78" stroke-width="1.4"/><circle cx="'+x+'" cy="'+y+'" r="4.4" stroke="#382e1d" stroke-width="1.6" fill="#ffe487"/></g>';
    }
    const km=local?2:5,bar=km*scale;
    const scaleBar='<g transform="translate(19,303)" fill="#f1f3df"><path d="M0 0v6h'+bar.toFixed(1)+'v-6" fill="none" stroke="#d4e8d8" stroke-width="1.5"/><text y="-4" font-size="11">'+km+' km</text></g>';
    return '<svg class="geo-map" viewBox="0 0 560 330" role="group" aria-label="'+esc(c.name)+'的位置與'+(layer==='fault'?'公告敏感區':kinds[kind])+'"><g>'+shapes+names+overlay+marker+'</g>'+scaleBar+'<g transform="translate(536,16)" fill="#e6eee2"><text text-anchor="middle" font-size="12">北</text><path d="M0 4l-4 10 4-2 4 2Z"/></g></svg>';
  }

  function mount(root,c,{esc,initialLayer,initialKind,initialScope,openDetails,share}){
    const point=validPoint(c);
    let layer=initialLayer==='subsidence'?'subsidence':'fault';
    let kind=Object.hasOwn(kinds,initialKind)?initialKind:'cumulative',scope=initialScope==='area' && point?'area':'city';
    root.innerHTML=`<div class="studio-geology"><section class="geo-atlas"><div class="geo-tools"><h3>社區位置與地質圖</h3><div class="geo-scale" aria-label="顯示範圍"><button type="button" data-geo-scope="city">全台南</button><button type="button" data-geo-scope="area" ${point?'':'disabled'}>社區周邊</button></div></div><div class="geo-drawing"></div><div class="geo-key"></div></section>
    <section class="geo-evidence"><div class="geo-picks" aria-label="社區地質圖層"><button type="button" data-geo-layer="fault">活動斷層敏感區</button><button type="button" data-geo-layer="subsidence">地層下陷</button></div>
    <label class="geo-kind">下陷資料 <select>${Object.entries(kinds).map(([k,v])=>'<option value="'+k+'">'+v+'</option>').join('')}</select></label>
    <div class="geo-readout" aria-live="polite"></div><div class="studio-actions"><button type="button" class="geo-details">更多環境資料</button><button type="button" class="geo-share">分享這個圖層</button><span class="copy-status" role="status"></span></div></section></div>`;
    const el=s=>root.querySelector(s);
    el('.geo-kind select').value=kind;
    function paint(){
      for(const button of root.querySelectorAll('[data-geo-layer]'))button.setAttribute('aria-pressed',String(layer===button.dataset.geoLayer));
      for(const button of root.querySelectorAll('[data-geo-scope]'))button.setAttribute('aria-pressed',String(scope===button.dataset.geoScope));
      const fault=layer==='fault',sub=window.MapSubsidence;
      const nearest=point && !approx(c)?sub?.lookup?.(c):null;
      const reading=nearest?.byKind?.[kind];
      const props=reading?.nearest?.properties;
      const sourceUrl=fault?faultSource:sources[kind];
      const src=layer==='fault'?'地質調查及礦業管理中心公告圖':'水利署'+kinds[kind]+'資料';
      const zone=fault?window.MapFaults?.lookup(c):null;
      let title,detail;
      if(fault){
        title=zone?.label || '公告圖層暫時無法判讀';
        detail=zone?.detail || '請以地段與地號查詢公告範圍。';
      }else if(!sub){title='地層下陷圖資尚未載入';detail='請至水利署核對原始資料。';}
      else if(!point || approx(c)){title=point?'社區位置為推估，請用完整門牌定位':'缺少可用社區座標';detail='可切換全市圖層查看水利署資料。';}
      else if(props && Number.isFinite(reading.distanceKm)){
        const km=reading.distanceKm;
        const distance=km<.01?'不到 10 公尺':km<1?'約 '+Math.round(km*100)*10+' 公尺':'約 '+Number(km.toFixed(1)).toLocaleString('zh-TW')+' 公里';
        title='距最近'+(kind==='station'?'測站':'等值線')+distance;
        detail=props.period+' · '+props.label+'。'+(kind==='station'?'站高程為測站標高。':'等值線記錄區域測量結果。')+'此社區基地的下陷量仍須個別量測。';
      }else{title='社區位置與監測圖層';detail=nearest?.summary || '請核對資料涵蓋範圍與觀測期別。';}
      const fc=(sub?.features||[]).filter(f=>f.properties.kind===kind);
      const period=fault?'公告圖資核對 '+(window.MapFaults?.source?.checked || '日期待核'):[...new Set(fc.map(f=>f.properties.period))].join('、');
      el('.geo-kind').hidden=fault;
      el('.geo-drawing').innerHTML=makeMap(c,layer,kind,scope,esc);
      const key=fault?'公告活動斷層敏感區':kind==='station'?'固定測站':kind==='cumulative'?'累積下陷量（公分）':'速率（公分／年）';
      el('.geo-key').innerHTML='<span><i class="'+(fault?'':kind==='station'?'geo-station':'geo-subs-line')+'"></i>'+key+'</span>'+(point?'<span><i class="geo-symbol"></i>'+esc(c.name)+(approx(c)?'（推估）':'')+'</span>':'<span>社區位置待補</span>')+'<output class="geo-point-info" aria-live="polite"></output>';
      for(const target of root.querySelectorAll('[data-geo-feature]')){
        const pick=()=>{el('.geo-point-info').textContent=target.getAttribute('aria-label');};
        target.onclick=pick;target.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();pick();}};
      }
      const cityUrl=new URL(location.pathname,location.origin);cityUrl.searchParams.set('layer',layer);
      el('.geo-readout').innerHTML='<h4>'+esc(title)+'</h4><p>'+esc(detail)+'</p><small>'+esc(period)+'</small><p><a href="'+sourceUrl+'" target="_blank" rel="noopener noreferrer">'+src+' ↗</a> · <a href="'+esc(cityUrl.href)+'" target="_blank" rel="noopener noreferrer">全市 3D 圖 ↗</a></p>';
      el('.copy-status').textContent='';el('.geo-share').textContent='分享這個圖層';
    }
    for(const b of root.querySelectorAll('[data-geo-layer]'))b.onclick=()=>{layer=b.dataset.geoLayer;paint();};
    for(const b of root.querySelectorAll('[data-geo-scope]'))b.onclick=()=>{scope=b.dataset.geoScope;paint();};
    el('.geo-kind select').onchange=e=>{kind=e.target.value;paint();};
    el('.geo-details').onclick=openDetails;el('.geo-share').onclick=e=>share(layer,e.currentTarget,kind,scope);
    paint();return {getLayer:()=>layer};
  }
  window.CommunityGround=Object.freeze({mount});
})();
