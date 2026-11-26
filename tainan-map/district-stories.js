/* 臺南行政區地方故事。史料、地圖與每則查核日由下方欄位對應。
 * 生活地圖延伸篇保留選題來源 ID。圖像、老照片與地圖由原機關提供瀏覽。
 */
(() => {
  'use strict';
  const checkedAt = '2026-11-26';
  const sources = {
    "aerial1974": ["中研院｜1974 年臺南市舊航照影像","https://gis.sinica.edu.tw/showwmts/index.php?l=Tainan_aerialphoto_1974&s=tainan"],
    "map1935": ["文化部典藏網｜1935 年臺南市街圖","https://tcmb.culture.tw/zh-tw/detail?id=144000003080&indexCode=MOCCOLLECTIONS"],
    "historyMap": ["中研院｜臺灣百年歷史地圖","https://gissrv4.sinica.edu.tw/gis/twhgis.aspx"],
    "geologyMap": ["地礦中心｜臺灣活動斷層圖台","https://faultgis.gsmma.gov.tw/gis/"],
    "soil": ["臺南市工務局｜地層、基礎與個案評估","https://www.tainan.gov.tw/News_Content.aspx?n=13371&s=3751893"],
    "east": ["東區公所｜東區地區災害防救計畫，第 8–10 頁","https://w3fs.tainan.gov.tw/001/Upload/173/attachment/19344/4362093/106_1229.pdf"],
    "ntu": ["臺灣大學地質科學系｜2007 年全新世地層研究","https://scholars.lib.ntu.edu.tw/entities/publication/6e28a517-b2f7-4642-a1b8-990df9b9c871"],
    "jianping": ["安平區公所｜建平里沿革","https://web.tainan.gov.tw/tnanping/News_Content.aspx?n=20623&s=4305706"],
    "port": ["臺南市文化局｜臺南運河","https://culture.tainan.gov.tw/form/Details?Parser=2,6,284,47,,,860"],
    "shipPhoto": ["國家文化記憶庫｜1959 年臺南運河碼頭照片","https://tcmb.culture.tw/zh-tw/detail?id=112605&indexCode=Culture_Object"],
    "square": ["臺南市都發局｜河樂廣場改建工程","https://udweb.tainan.gov.tw/News_Content.aspx?n=17355&s=7656929"],
    "sediment": ["台江國家公園｜自然地景資源調查，圖 4-31 歷年沙洲位置","https://ws.moi.gov.tw/Download.ashx?icon=..pdf&n=MjAxMzExMjYxNTU0NDk4MjM4MTEucGRm&u=LzAwMS9VcGxvYWQvT2xkRmlsZV9USk5QL1Jlc3VsdC8yMDEzMTEyNjE1NTQ0OTgyMzgxMS5wZGY%3D"],
    "sicao": ["內政部｜台江國家公園計畫，竹筏港舊道","https://ws.moi.gov.tw/001/Upload/OldFile_TJNP/ckfinder/userfiles/files/20180828-5.pdf"],
    "yewang": ["內政部｜學甲慈濟宮與葉王作品","https://taiwangods.moi.gov.tw/html/cultural/3_0011.aspx?i=62"],
    "anping": ["文化部文資局｜熱蘭遮堡遺構","https://tcmb.culture.tw/zh-tw/detail?id=20230901000001&indexCode=BOCH_CountryCulture_11"],
    "south": ["臺南市文化局｜水交社文化園區沿革","https://shueijiaoshe.tainan.gov.tw/index.php?inter=about"],
    "water": ["經濟部水利署｜烏山頭水庫","https://www.wra.gov.tw/News_Content.aspx?n=3254&s=19384"],
    "nanhua": ["經濟部水利署｜南化水庫","https://www.wra.gov.tw/News_Content.aspx?n=3254&s=19385"],
    "danei": ["文化部文資局｜大內頭社太祖夜祭","https://tcmb.culture.tw/zh-tw/detail?id=20080627000005&indexCode=BOCH_CountryCulture_51"],
    "dongshan": ["西拉雅國家風景區管理處｜吉貝耍部落","https://www.siraya-nsa.gov.tw/zh-tw/attractions/detail/152"],
    "honey": ["農業部｜楠西梅嶺休閒農業區","https://www.moa.gov.tw/ws.php?id=13950"],
    "taps": ["臺南山上花園水道博物館｜臺南水道沿革","https://waterworks.tainan.gov.tw/index.php?modify=about"],
    "fossil": ["臺南市文化局｜左鎮化石園區沿革","https://culture.tainan.gov.tw/theme/content/index?Parser=1,51,368,367"],
    "districtFault": ["臺南市災防辦公室｜市內斷層分布與行政區","https://web.tainan.gov.tw/publicdisaster/News_Content.aspx?n=21181&s=7934994"],
    "faultStyles": ["中央氣象署｜斷層的運動方向","https://scweb.cwa.gov.tw/zh-tw/guidance/faqdetail/11"],
    "houjia": ["地礦中心｜後甲里斷層","https://fault.gsmma.gov.tw/About/map_more?id=2f951a9fa30f4de6bf0e9d3b343b7b6c"],
    "liujia": ["地礦中心｜六甲斷層","https://fault.gsmma.gov.tw/About/map_more?id=a03d40bec7084c99bd88b4bcd193ff76"],
    "xinhua": ["地礦中心｜新化斷層","https://fault.gsmma.gov.tw/About/map_more?id=1dd6cbac6e614bffa6d81cedf2cb7cc9"],
    "quake": ["中央氣象署｜1946 年新化地震調查","https://scweb.cwa.gov.tw/zh-tw/page/disaster/12"],
    "zuozhen": ["地礦中心｜左鎮斷層","https://fault.gsmma.gov.tw/About/map_more?id=c3772e901fa74ac7ba0f9aefa0d7dfdb"],
    "kouxiao": ["地礦中心｜口宵里斷層","https://fault.gsmma.gov.tw/About/map_more?id=900a4f075851474d8c94a61a2c0c4548"],
    "muji": ["地礦中心｜木屐寮斷層","https://fault.gsmma.gov.tw/About/map_more?id=b122ecd4c76e42828a4b471522ea06c3"],
    "baizone": ["經濟部｜白河木屐寮斷層地質敏感區公告","https://www.moea.gov.tw/Mns/populace/news/News.aspx?kind=1&menu_id=40&news_id=121724"],
    "five": ["臺南市觀旅局｜五條港舊街與商業","https://www.twtainan.net/zh-tw/application/activity/22/"],
    "market": ["國家文化記憶庫｜水仙宮市場","https://tcmb.culture.tw/zh-tw/detail?id=284999&indexCode=Culture_Place"],
    "local-beimen": ["臺南市政府觀光旅遊局｜井仔腳瓦盤鹽田","https://www.twtainan.net/zh-tw/attractions/detail/587/"],
    "local-jiangjun": ["雲嘉南濱海國家風景區管理處｜青鯤鯓扇形鹽田","https://www.swcoast-nsa.gov.tw/zh-tw/attraction/details/87"],
    "local-jiali": ["臺南市政府觀光旅遊局｜蕭壠文化園區","https://www.twtainan.net/zh-tw/attractions/detail/484/"],
    "local-xigang": ["臺南市政府觀光旅遊局｜西港慶安宮","https://www.twtainan.net/zh-tw/attractions/detail/485/"],
    "local-west-central": ["臺南市政府觀光旅遊局｜赤崁樓","https://www.twtainan.net/zh-tw/attractions/detail/674/"],
    "local-north": ["臺南市政府文化局｜臺南議政展：臺南公園","https://culture.tainan.gov.tw/form/Details?Parser=2,6,284,47,,,858"],
    "local-east": ["臺南市東區區公所｜原臺南縣知事官邸","https://www.tneast.gov.tw/News_Content.aspx?n=21133&s=7656013"],
    "local-yongkang": ["臺南市政府觀光旅遊局｜永康三崁店糖廠神社遺蹟","https://twtainan.net/zh-tw/attractions/detail/4260/"],
    "local-rende": ["臺南市政府觀光旅遊局｜保安車站","https://www.twtainan.net/zh-tw/attractions/detail/571/"],
    "local-guiren": ["臺南市政府觀光旅遊局｜歸仁美學館","https://www.twtainan.net/zh-tw/attractions/detail/4279/"],
    "local-xinying": ["臺南市政府觀光旅遊局｜新營鐵道文化園區","https://www.twtainan.net/zh-tw/attractions/detail/498/"],
    "local-yanshui": ["臺南市政府觀光旅遊局｜月津港親水公園","https://www.twtainan.net/zh-tw/attractions/detail/4282/"],
    "local-houbi": ["臺南市政府觀光旅遊局｜菁寮老街","https://twtainan.net/zh-tw/attractions/detail/943/"],
    "local-liuying": ["臺南市政府觀光旅遊局｜劉啟祥美術紀念館","https://twtainan.net/zh-tw/attractions/detail/5624/"],
    "local-madou": ["總爺藝文中心｜園區沿革","https://tyart.tnc.gov.tw/index.php?id=1&inter=about"],
    "local-xiaying": ["臺南市政府觀光旅遊局｜顏水龍紀念公園","https://www.twtainan.net/zh-tw/attractions/detail/525/"],
    "local-liujia": ["臺南市政府觀光旅遊局｜赤山龍湖巖","https://www.twtainan.net/zh-tw/attractions/detail/532/"],
    "local-shanhua": ["臺南市政府觀光旅遊局｜善化慶安宮","https://www.twtainan.net/zh-tw/attractions/detail/554/"],
    "local-xinshi": ["國立臺灣史前文化博物館南科考古館｜簡介","https://stsp.nmp.gov.tw/introduction"],
    "local-anding": ["臺南市政府觀光旅遊局｜蘇厝第一代天府真護宮","https://twtainan.net/zh-tw/attractions/detail/1339/"],
    "local-baihe": ["西拉雅國家風景區管理處｜關子嶺溫泉","https://www.siraya-nsa.gov.tw/zh-tw/attractions/detail/3"],
    "local-xinhua": ["臺南市政府觀光旅遊局｜新化老街","https://www.twtainan.net/zh-tw/attractions/detail/559/"],
    "local-yujing": ["噍吧哖文化園區｜關於我們","https://tapani.tainan.gov.tw/index.php?inter=about"],
    "local-guanmiao": ["臺南市政府觀光旅遊局｜關廟山西宮","https://www.twtainan.net/zh-tw/attractions/detail/580/"],
    "local-longqi": ["農業部農村發展及水土保持署・農業易遊網｜牛埔泥岩","https://ezgo.ardswc.gov.tw/zh-tw/spot/985/"]
  };
  const stories = [
    {
      id: "eastern-terrace",
      districts: ["東區"],
      theme: "地形與水岸",
      era: "全新世至今",
      title: "東區地勢為什麼有起伏？",
      body: ["從勝利路往大同路走，路面雖然起伏不大，東區公所的地形調查仍辨認出南北排列的古沙丘。視線拉遠，臺南臺地整體的隆起，又有另一段更長的歷史。2007 年臺大地質研究以鑽出的岩心和探槽比對地層，提出地下逆衝及地層拱起的解釋。","回到街廓，溪流也切出了低地。東區公所記錄竹溪一帶地勢較低。想知道一棟房子的地基，要看該基地的鑽探土層、地下水與建物基礎設計，交由專業技師判讀。單憑地址在東區或臺地上，無法判斷承載力。"],
      refs: ["east","ntu","soil"],
      map: "historyMap"
    },
    {
      id: "jianping-coast",
      districts: ["安平區"],
      theme: "地形與水岸",
      era: "1974–1996",
      title: "永華市政中心這塊地，曾經養魚",
      body: ["打開 1974 年的臺南航照，找今天市府、市議會的位置，眼前的街廓當時還是一格格魚塭。建平里位於上鯤鯓段，居民先在海埔新生地築堤養魚；1986 年 5 月，市府把這片魚塭納入第五期重劃區填土，1996 年 10 月市府才從中正路搬來。","水邊的地可以先經泥沙堆積，再被人整理為魚塭，最後經工程成為街道。這段里史能說明建平里的土地利用。查某個門牌的填土深度、基礎形式或承載力，仍須回到該基地的地質與建築資料。"],
      refs: ["jianping","aerial1974","soil"],
      primaryLink: ["aerial1974","看 1974 年航照"],
      map: "historyMap"
    },
    {
      id: "canal-route",
      districts: ["中西區","安平區"],
      theme: "地形與水岸",
      era: "1823–1926",
      title: "從安平到府城，船改走哪條水路？",
      body: ["1823 年曾文溪改道，臺江水域漸淤。府城三郊商人出錢僱工闢水路，好讓船貨繼續進城。1903 年的洪水又使舊運河潰堤、積沙。1922 年動工時，工程選在古運河南側另開一條，1926 年 4 月 25 日通航。","今日看到的臺南運河就是後來這條新水路。看中研院的 1935 年臺南市街圖，從安平一側沿水道往市中心找船塢，再看 1959 年碼頭照片，就能把船卸貨的位置接回今日街區。"],
      refs: ["port","shipPhoto","map1935"],
      primaryLink: ["map1935","看 1935 年臺南市街圖"],
      map: "historyMap"
    },
    {
      id: "city-wharf",
      districts: ["中西區"],
      theme: "街區與生活",
      era: "1959 年至今",
      title: "河樂廣場的水池，以前是船停靠的地方",
      body: ["今天沿中正路從康樂街走向環河街，會經過河樂廣場。1959 年的老照片裡，市區運河的盡頭還停著船，碼頭旁是漁獲上岸交易的街區。運輸功能衰退後，水域填平蓋起中國城，商場又在 2016 年拆除。","改建時保留了部分中國城的構造。站在下沉廣場看水池和露出的柱子，能在同一處認出碼頭、商場與公園這三段生活史。"],
      refs: ["shipPhoto","port","square"],
      primaryLink: ["shipPhoto","看 1959 年碼頭照片"],
      map: "historyMap"
    },
    {
      id: "wharf-market",
      districts: ["中西區"],
      theme: "街區與生活",
      era: "清代至 1959 年",
      title: "水仙宮前的市場，客人原本搭船來",
      body: ["清代五條港的船能把貨帶到廟前，信眾、船員、攤販就地做起買賣。今天從海安路轉進神農街，走的正是昔日商業街北勢街。港道消退後，市場卻留了下來。","1959 年市府在水仙宮西側廣場設立長樂市場。買菜時看一眼廟與市場的相對位置，就能理解，今日攤商聚集的地方，早已是水路上的交易據點。"],
      refs: ["five","market"],
      map: "historyMap"
    },
    {
      id: "houjia-fault",
      districts: ["東區","永康區","仁德區"],
      theme: "斷層故事",
      era: "從永康到虎山",
      title: "後甲里斷層，如何在地形留下線索？",
      body: ["在地礦中心的圖上，從永康往南找到仁德虎山，後甲里斷層大致朝南北延伸，途中經過東區。它屬逆移斷層：地殼受到擠壓，沿傾斜的斷層面，一側相對向上移動。地質人員比對地形、岩層和測量紀錄，才能辨認長期累積的變動。","這條長約 12 公里的構造是區域尺度的線索。要知道某個社區和公告範圍的位置關係，可另查官方圖資，再以地號、基地調查及建築資料確認。"],
      refs: ["houjia","faultStyles","districtFault"],
      map: "geologyMap"
    },
    {
      id: "xinhua-quake",
      districts: ["新化區"],
      theme: "斷層故事",
      era: "1946 年 12 月 5 日",
      title: "新化那拔林的清晨，田埂與道路錯了位",
      body: ["1946 年 12 月 5 日清晨，新化、那拔林附近發生地震。當時的調查看到田地、溝堤和道路斷裂或彎曲，震動也影響了水管和鐵路。這些日常設施意外成了記錄地表位移的尺。","新化斷層以右移為主。想像站在斷層一側望向對面，另一側相對往右移。這和地層上下推擠的逆移不同，也說明為何科學家特別留意橫跨斷層的直線地物。"],
      refs: ["quake","xinhua","faultStyles"],
      map: "geologyMap"
    },
    {
      id: "liujia-fault",
      districts: ["白河區","東山區","柳營區","六甲區","官田區"],
      theme: "斷層故事",
      era: "六重溪南岸至官田社子",
      title: "為什麼五個行政區會讀到同一條六甲斷層？",
      body: ["沿嘉南平原與山麓的交界，地礦中心把六甲斷層從白河六重溪南岸追到官田社子，長約 21 公里。受擠壓的地層沿斷層面逆移，地質人員從露頭、鑽井到地下淺層反覆比對，才把分散在各地的線索接起來。","白河、東山、柳營、六甲及官田都在這條跨區故事線上。看圖時先找到所在行政區，再放大至地段，行政界線之內仍有距離與位置的差異。"],
      refs: ["liujia","districtFault","faultStyles"],
      map: "geologyMap"
    },
    {
      id: "zuozhen-fault",
      districts: ["山上區","左鎮區","南化區"],
      theme: "斷層故事",
      era: "新庄至心仔寮",
      title: "從山上新庄到南化心仔寮，地層怎麼向左移？",
      body: ["地礦中心追查左鎮斷層，記錄的兩端分別在山上新庄與南化心仔寮附近，走向約西北，長約 10 公里。「左移」描述兩側地塊的相對運動，站在這側望過去，對面的地塊向左。","在同一片丘陵裏，還能找到不同方向的構造。切換到口宵里斷層看，它從楠西經玉井延伸到左鎮一帶，記錄的是逆移。兩條線同在左鎮，各有自己的走向與證據。"],
      refs: ["zuozhen","kouxiao","faultStyles"],
      map: "geologyMap"
    },
    {
      id: "kouxiao-fault",
      districts: ["楠西區","玉井區","左鎮區"],
      theme: "斷層故事",
      era: "曾文二號橋至左鎮東平",
      title: "沿著曾文二號橋，找口宵里斷層的起點",
      body: ["地礦中心追查的口宵里斷層，北起楠西曾文二號橋一帶，往南經玉井，到左鎮東平附近，約 21 公里。它是逆斷層，斷層面向西傾，地層在擠壓中有一側相對抬升。","官方說明特別交代，橋以北仍缺少這條斷層繼續延伸的證據。地圖上的線有終點，也記錄了調查做到哪裡；不能沿著同一方向，自行把線接到下一個聚落。"],
      refs: ["kouxiao","districtFault","faultStyles"],
      map: "geologyMap"
    },
    {
      id: "baihe-fault",
      districts: ["白河區"],
      theme: "斷層故事",
      era: "白河六重溪兩岸",
      title: "六重溪兩岸，為何出現不同的斷層名？",
      body: ["在白河的地質圖上，木屐寮斷層向南延伸到六重溪北岸，屬逆移；六甲斷層的調查範圍則從六重溪南岸往官田方向延伸。白河區內另有觸口斷層。要讀懂這段山腳，先找溪流，再對照各條斷層的位置。","經濟部另公告木屐寮斷層地質敏感區，供土地開發前查詢。分布圖的線說明地質構造，公告圖的範圍則是按地號核對的入口。"],
      refs: ["muji","liujia","baizone","districtFault"],
      map: "geologyMap"
    },
    {
      id: "local-beimen",
      districts: ["北門區"],
      theme: "產業與聚落",
      era: "1818 年",
      title: "井仔腳的鹽，為什麼曬在碎瓦上？",
      body: ["1818 年瀨東鹽場搬到今天的井仔腳。鹽工將瓦片一塊塊拼成結晶池底，今天看來像馬賽克的紋路，原是鹽業設施。2002 年曬鹽停歇，後來鹽田復育，才留下今天仍能看見的田格。"],
      refs: ["local-beimen"],
      map: "historyMap",
      lifeId: "life-beimen-1",
      lifeTitle: "井仔腳瓦盤鹽田"
    },
    {
      id: "local-jiangjun",
      districts: ["將軍區"],
      theme: "產業與聚落",
      era: "1975–2002",
      title: "青鯤鯓這把「扇子」，原是鹽工的工作路線",
      body: ["1975 年開闢、1977 年開始曬鹽的扇形鹽田，將結晶池安排在宿舍附近，縮短收鹽的路程。從空中看像扇骨的線條，有的送水、有的排水。直到 2002 年停曬，這套按製鹽工序畫出的形狀仍留在地上。"],
      refs: ["local-jiangjun"],
      map: "historyMap",
      lifeId: "life-jiangjun-1",
      lifeTitle: "青鯤鯓扇形鹽田"
    },
    {
      id: "local-qigu",
      districts: ["七股區"],
      theme: "地形與水岸",
      era: "1904–2009",
      title: "七股的蚵田，為什麼在海邊還有一層沙洲？",
      body: ["從七股岸邊往外海，先是蚵田和潟湖，再是擋住外海風浪的沙洲。台江國家公園比對 1904 年堡圖與 2009 年衛星影像，發現青山港、網仔寮一帶的沙洲曾向東移動，也曾分開又連在一起。養蚵人面對的是一條會改變形狀的海岸，百年前地圖上的潮口，未必還在同一處。"],
      refs: ["sediment"],
      map: "historyMap",
      lifeId: "life-qigu-1",
      lifeTitle: "七股潟湖"
    },
    {
      id: "local-xuejia",
      districts: ["學甲區"],
      theme: "信仰與民俗",
      era: "1860 年",
      title: "學甲慈濟宮怎麼留住一位匠師的手藝？",
      body: ["1860 年學甲地方人士募資修廟，請葉王用交趾陶裝飾牆面與屋頂。人像的姿態與釉色，本來就是信眾進廟時看的故事。如今原件另由文物館保存，參觀時可以把廟上的裝飾與館藏分開對照。"],
      refs: ["yewang"],
      map: "historyMap",
      lifeId: "life-xuejia-1",
      lifeTitle: "學甲慈濟宮"
    },
    {
      id: "local-jiali",
      districts: ["佳里區"],
      theme: "產業與聚落",
      era: "1908–2005",
      title: "走進蕭壠的展場，以前這裡忙著製糖",
      body: ["蕭壠糖廠在 1908 年開始製糖，後來稱為佳里糖廠。1998 年關廠後，倉庫、鐵軌和小火車留了下來。2005 年園區改以藝文空間開放，現在沿展間走，還看得出貨物曾如何在一棟棟倉庫之間移動。"],
      refs: ["local-jiali"],
      map: "historyMap",
      lifeId: "life-jiali-1",
      lifeTitle: "蕭壠文化園區"
    },
    {
      id: "local-xigang",
      districts: ["西港區"],
      theme: "信仰與民俗",
      era: "清康熙年間",
      title: "慶安宮屋頂為什麼有那麼多鯉魚？",
      body: ["1712 年創建的慶安宮，流傳著廟址是「鯉魚穴」的傳說。抬頭能看見屋頂的鯉魚剪黏，到了刈香時又能看到鯉魚令旗。同一條魚，平日住在屋脊上，祭典時跟著人走進各庄。"],
      refs: ["local-xigang"],
      map: "historyMap",
      lifeId: "life-xigang-1",
      lifeTitle: "西港慶安宮"
    },
    {
      id: "local-annan",
      districts: ["安南區"],
      theme: "地形與水岸",
      era: "清代至今",
      title: "四草的樹蔭下，原有一條送貨的路",
      body: ["四草大眾廟後方的竹筏港舊道，是百餘年前運送民生物資的人工水路。今天兩岸紅樹林的枝葉覆在水面，遊客稱它為綠色隧道。若只看濃蔭，容易錯過這條窄水道原本服務沿海聚落的用途。"],
      refs: ["sicao"],
      map: "historyMap",
      lifeId: "life-annan-1",
      lifeTitle: "四草綠色隧道"
    },
    {
      id: "local-anping",
      districts: ["安平區"],
      theme: "街區與生活",
      era: "1624–1662",
      title: "熱蘭遮堡，為何蓋在一鯤鯓沙洲上？",
      body: ["1624 年荷蘭東印度公司把據點從澎湖遷到大員，在一鯤鯓沙洲建堡。這裡既要能防守，也要接上東亞貿易航線，堡壘因此持續擴建。今天走到安平古堡附近，很難只憑周圍街景想像，當時的關鍵條件正是這座沙洲與水路的位置。"],
      refs: ["anping"],
      map: "historyMap",
      lifeId: "life-anping-1",
      lifeTitle: "安平古堡"
    },
    {
      id: "local-west-central",
      districts: ["中西區"],
      theme: "街區與生活",
      era: "17 世紀以來",
      title: "赤崁樓的院子，為何同時有城堡、廟與石碑？",
      body: ["荷蘭時期的普羅民遮堡落在今天的赤崁樓一帶。經過幾個朝代改建，現在看到的海神廟、文昌閣和院內石碑，各有來歷。由大南門城邊移來的御碑，又替這個院子留下另一處府城地標的記憶。"],
      refs: ["local-west-central"],
      map: "historyMap",
      lifeId: "life-west-central-1",
      lifeTitle: "赤崁樓"
    },
    {
      id: "local-north",
      districts: ["北區"],
      theme: "街區與生活",
      era: "1911–1917",
      title: "臺南公園開闢時，老樹怎麼辦？",
      body: ["1911 年開始規劃興建臺南公園時，設計者盡量保留原有樹木。龍眼與苦楝身旁，後來又種進鳳凰木和蘇鐵。1917 年公園開放，市民能看球、騎車，也能在月見池賞月。今天散步經過的樹蔭，有一部分早於公園本身。"],
      refs: ["local-north"],
      map: "historyMap",
      lifeId: "life-north-1",
      lifeTitle: "臺南公園"
    },
    {
      id: "local-east",
      districts: ["東區"],
      theme: "街區與生活",
      era: "1900 年代至戰後",
      title: "知事官邸裡，也曾辦過地政業務",
      body: ["這棟洋樓起初供臺南縣知事使用；1901 年行政制度改變後，建築也換了住客，曾用來接待來訪的官員和皇族。戰後，洋館又成為地政事務所、東區區公所等機關的辦公處。一棟官邸的用途變化，就留下好幾代居民洽公的記憶。"],
      refs: ["local-east"],
      map: "historyMap",
      lifeId: "life-east-1",
      lifeTitle: "原臺南縣知事官邸"
    },
    {
      id: "local-south",
      districts: ["南區"],
      theme: "街區與生活",
      era: "日治時期至 2019 年",
      title: "水交社的宿舍，住過哪些人？",
      body: ["今日的水交社文化園區，曾住著日治時期駐防臺南機場的海軍航空隊官兵與眷屬。戰後又有空軍眷戶在這裡生活。2004 年部分宿舍群獲指定保存，2019 年園區成立，這些房舍讓兩段眷居史能在同一個地方被閱讀。"],
      refs: ["south"],
      map: "historyMap",
      lifeId: "life-south-3",
      lifeTitle: "水交社文化園區"
    },
    {
      id: "local-yongkang",
      districts: ["永康區"],
      theme: "產業與聚落",
      era: "日治時期",
      title: "從三崁店的石座，找回一座糖廠神社",
      body: ["日治時期，三崁店糖廠內設有神社。木造建築陸續消失，鳥居、石燈與本殿的基座仍留下位置。沿參道辨認這些石座，便能看出工廠除製糖外，也曾有一套與信仰相連的生活空間。"],
      refs: ["local-yongkang"],
      map: "historyMap",
      lifeId: "life-yongkang-1",
      lifeTitle: "永康三崁店糖廠神社遺蹟"
    },
    {
      id: "local-rende",
      districts: ["仁德區"],
      theme: "產業與聚落",
      era: "1899 年以後",
      title: "為了運糖，保安車站搬過家",
      body: ["1899 年設立的車路墘車站，在今天保安車站以南約一公里半。為了配合附近糖廠運輸，站址後來北移。如今許多人因「永保安康」車票記得這座木造小站，它落腳在這裡的原因，卻得回到糖廠和鐵路的關係。"],
      refs: ["local-rende"],
      map: "historyMap",
      lifeId: "life-rende-1",
      lifeTitle: "保安車站"
    },
    {
      id: "local-guiren",
      districts: ["歸仁區"],
      theme: "街區與生活",
      era: "約 1934 年",
      title: "歸仁圓環旁，黃色洋樓曾是地方行政中心",
      body: ["約 1934 年落成的歸仁庄役場，後來由歸仁警分局使用。分局遷走後房舍曾經閒置，如今成了歸仁美學館。走到圓環旁這棟建築，從庄役場、警局到展覽空間，三種用途都指向同一個地方生活的中心。"],
      refs: ["local-guiren"],
      map: "historyMap",
      lifeId: "life-guiren-1",
      lifeTitle: "歸仁美學館"
    },
    {
      id: "local-xinying",
      districts: ["新營區"],
      theme: "產業與聚落",
      era: "糖鐵客運興盛時期",
      title: "新營糖廠的五分車也載人",
      body: ["在新營糖廠，密集的股道讓不同車輛能調度、換線。除了把原料運進廠，五分車也曾載客，新營是糖鐵客運的重要據點。看看鐵道文化園區保留的車廂與柴油機車頭，便能理解為什麼糖廠也曾是溪北居民的交通樞紐。"],
      refs: ["local-xinying"],
      map: "historyMap",
      lifeId: "life-xinying-1",
      lifeTitle: "新營鐵道文化園區"
    },
    {
      id: "local-yanshui",
      districts: ["鹽水區"],
      theme: "街區與生活",
      era: "清代至 2012 年以後",
      title: "月津港為何成了鹽水看燈的地方？",
      body: ["沿月津港走到橋南老街，岸邊留著清代街道和日治街屋，是港口買賣帶動街市的痕跡。2012 年起，月津港燈節又把作品帶回水邊。以前人沿著港岸做生意，現在看燈的人也沿著同一片水岸走進老街。"],
      refs: ["local-yanshui"],
      map: "historyMap",
      lifeId: "life-yanshui-1",
      lifeTitle: "月津港親水公園"
    },
    {
      id: "local-houbi",
      districts: ["後壁區"],
      theme: "街區與生活",
      era: "清代",
      title: "菁寮的「嫁妝街」，先是一處交通要道",
      body: ["清代從這一帶往諸羅縣城，菁寮是重要驛站。今天南 82 線與南 85 線交會處附近，旅館和店鋪曾靠著來往客人做生意。後來人們也記得在老街張羅婚嫁用品的日子，「嫁妝街」便成了這段街道的另一個名字。"],
      refs: ["local-houbi"],
      map: "historyMap",
      lifeId: "life-houbi-1",
      lifeTitle: "菁寮老街"
    },
    {
      id: "local-liuying",
      districts: ["柳營區"],
      theme: "街區與生活",
      era: "1910–2018",
      title: "一棟畫家故居，怎麼重新開門？",
      body: ["畫家劉啟祥 1910 年生於柳營，中山西路上的洋樓是他的故居。洋樓閒置受損後，家屬與市府花了三年，才取得十七位土地持有人的同意。修復後的紀念館於 2018 年底開放，一段協調土地與保存建築的地方史也留了下來。"],
      refs: ["local-liuying"],
      map: "historyMap",
      lifeId: "life-liuying-1",
      lifeTitle: "劉啟祥美術紀念館"
    },
    {
      id: "local-madou",
      districts: ["麻豆區"],
      theme: "產業與聚落",
      era: "1912–2001",
      title: "麻豆的居民，替總爺糖廠留下了什麼？",
      body: ["總爺工廠在 1912 年營運，1993 年關閉。1998 年開始拆廠時，地方文史工作者與居民發起保存。辦公紅樓、員工餐廳、宿舍和老樟樹群因此留了下來。2001 年藝文中心掛牌，今日園區的尺度仍能讓人辨認當年工廠生活的範圍。"],
      refs: ["local-madou"],
      map: "historyMap",
      lifeId: "life-madou-1",
      lifeTitle: "總爺藝文中心"
    },
    {
      id: "local-xiaying",
      districts: ["下營區"],
      theme: "街區與生活",
      era: "20 世紀",
      title: "從紅毛厝出發，顏水龍的足跡回到下營",
      body: ["顏水龍出身下營紅毛厝，早年受鼓勵赴日本學畫，再到巴黎深造。1997 年過世後，家鄉以紀念公園保存他的作品與生平。家廟前的銅像，把這位走過不同國家的畫家，再一次放回了他成長的聚落。"],
      refs: ["local-xiaying"],
      map: "historyMap",
      lifeId: "life-xiaying-1",
      lifeTitle: "顏水龍紀念公園"
    },
    {
      id: "local-liujia",
      districts: ["六甲區"],
      theme: "信仰與民俗",
      era: "1972 年",
      title: "赤山龍湖巖的樑，看起來像木頭嗎？",
      body: ["今天所見的赤山龍湖巖在 1972 年改建。大雄寶殿與後殿用鋼筋混凝土做出木構外觀，後殿山牆又與傳統剪黏並列。近看材料與裝飾，能讀出當年的匠人如何用新的工法，延續信眾熟悉的寺院樣貌。"],
      refs: ["local-liujia"],
      map: "historyMap",
      lifeId: "life-liujia-1",
      lifeTitle: "赤山龍湖巖"
    },
    {
      id: "local-guantian",
      districts: ["官田區"],
      theme: "地形與水岸",
      era: "1920–1930",
      title: "官田這片湖，怎麼和嘉南平原的田連起來？",
      body: ["烏山頭水庫從 1920 年施工至 1930 年。若只站在壩頂看分岔的水岸，很難想像水離開這裡以後的旅程。從出水工放出的水進入嘉南大圳，沿渠線送往農田。官田的湖面與遠方田裡的灌溉，本來就是同一套工程。"],
      refs: ["water"],
      map: "historyMap",
      lifeId: "life-guantian-1",
      lifeTitle: "烏山頭水庫風景區"
    },
    {
      id: "local-shanhua",
      districts: ["善化區"],
      theme: "信仰與民俗",
      era: "清代至戰後初期",
      title: "善化慶安宮裡，幾代工匠在同一座廟相遇",
      body: ["清代已有的善化慶安宮，也曾是地方講學之所。三川殿的木雕、正殿的藻井，到了戰後又和潘春源的壁畫、江清露的泥塑共存。由廟口一路走進正殿，能透過木、彩繪和泥塑辨認不同工藝留下的層次。"],
      refs: ["local-shanhua"],
      map: "historyMap",
      lifeId: "life-shanhua-1",
      lifeTitle: "善化慶安宮"
    },
    {
      id: "local-xinshi",
      districts: ["新市區"],
      theme: "產業與聚落",
      era: "1995–2019",
      title: "科學園區動土前，地下已住過哪些人？",
      body: ["1995 年起的南科考古調查，陸續找到不同年代的聚落遺址。出土的文化層從約五千年前一路延續到近代。為保存搶救發掘的材料，南科考古館在 2019 年開館。今天園區的科技街廓之下，還有一段長得多的生活史。"],
      refs: ["local-xinshi"],
      map: "historyMap",
      lifeId: "life-xinshi-1",
      lifeTitle: "國立臺灣史前文化博物館南科考古館"
    },
    {
      id: "local-anding",
      districts: ["安定區"],
      theme: "信仰與民俗",
      era: "1991 年",
      title: "蘇厝的王船，過了祭期還能看見",
      body: ["曾文溪旁的蘇厝真護宮，地方信仰與漂來的王船相連。廟裡供奉的永祀王船平常就能看見。今日廟貌在 1991 年完成，樓上壁畫運用近似水彩的畫法。王船延續故事，牆面則留下這一代的選擇。"],
      refs: ["local-anding"],
      map: "historyMap",
      lifeId: "life-anding-1",
      lifeTitle: "蘇厝第一代天府真護宮"
    },
    {
      id: "local-baihe",
      districts: ["白河區"],
      theme: "地形與水岸",
      era: "日治時期以來",
      title: "在關子嶺，先找水從哪裡冒出來",
      body: ["日治時期關子嶺溫泉便已聞名，當地少見的泥漿溫泉成了山城的招牌。走到溫泉公園的寶泉橋，可以看見寶泉露頭。從泉水冒出的地點看起，再想像人們在附近開設浴場，會更容易理解溫泉聚落為何在此形成。"],
      refs: ["local-baihe"],
      map: "historyMap",
      lifeId: "life-baihe-1",
      lifeTitle: "關子嶺溫泉公園與寶泉露頭"
    },
    {
      id: "local-dongshan",
      districts: ["東山區"],
      theme: "信仰與民俗",
      era: "農曆九月初五",
      title: "吉貝耍的大公廨，連著哪些家族記憶？",
      body: ["東山吉貝耍部落保有一座大公廨與五座家族公廨。農曆九月初五的夜祭與孝海祭，把族人與祖靈的記憶連在一起。從村裡不同的公廨來看，同一個部落既有各家族的信仰空間，也有共同聚集的地方。"],
      refs: ["dongshan"],
      map: "historyMap",
      lifeId: "life-dongshan-1",
      lifeTitle: "西拉雅部落・吉貝耍"
    },
    {
      id: "local-danei",
      districts: ["大內區"],
      theme: "信仰與民俗",
      era: "1983 年",
      title: "頭社公廨有三間祭室，分別屬於誰？",
      body: ["大內頭社早年的公廨以竹、茅草搭建。1983 年重建後，三間祭室分屬頭社、大山腳和交力林，各有自己的祭壇。一座共同的建築，把三個聚落的關係留在平面配置裡，今日的夜祭也承續這份連結。"],
      refs: ["danei"],
      map: "historyMap",
      lifeId: "life-danei-2",
      lifeTitle: "頭社公廨（太上龍頭忠義廟）"
    },
    {
      id: "local-xinhua",
      districts: ["新化區"],
      theme: "街區與生活",
      era: "日治時期",
      title: "中正路上的洋樓，記得新化做過郡治",
      body: ["日治時期新化郡的範圍含善化、新市，一路延伸到玉井、楠西和南化。新化街位於山區與平原往來的入口，商業因而聚集。走在今天中正路，看各家街屋花樣不同的立面，便能想像商戶如何讓自家店面在街上被認出。"],
      refs: ["local-xinhua"],
      map: "historyMap",
      lifeId: "life-xinhua-1",
      lifeTitle: "新化老街"
    },
    {
      id: "local-shanshang",
      districts: ["山上區"],
      theme: "地形與水岸",
      era: "1912–1922",
      title: "山上的水，如何一路送到府城市區？",
      body: ["1912 年動工的臺南水道，1922 年開始供水，運用高度差把處理後的水送往臺南市區。今日在水道博物館仍能看見濾筒與管線。轉開水龍頭做的事，當時要從山上這一整套取水、過濾與輸送設備開始。"],
      refs: ["taps"],
      map: "historyMap",
      lifeId: "life-shanshang-1",
      lifeTitle: "臺南山上花園水道博物館"
    },
    {
      id: "local-yujing",
      districts: ["玉井區"],
      theme: "街區與生活",
      era: "1915–2025",
      title: "一座糖廠的招待所，怎麼說起噍吧哖？",
      body: ["1915 年爆發噍吧哖事件。百年後，臺南市將玉井糖廠招待所等建物整修成紀念園區，讓人能在事件相關地區認識這段抗日史。2025 年園區更名為「噍吧哖文化園區」，這個玉井舊名也因此繼續出現在地方日常。"],
      refs: ["local-yujing"],
      map: "historyMap",
      lifeId: "life-yujing-1",
      lifeTitle: "噍吧哖文化園區"
    },
    {
      id: "local-nanxi",
      districts: ["楠西區"],
      theme: "產業與聚落",
      era: "1981 年",
      title: "梅嶺出名以前，山上種的是香蕉",
      body: ["楠西這片山坡曾以香蕉為重要作物，香蕉收益下降後，農民改種梅。1981 年「梅嶺」成為新地名。如今人們上山看梅花、吃梅製品，地名本身就記下了一次農作轉換，也記下山區居民怎麼找出新的生計。"],
      refs: ["honey"],
      map: "historyMap",
      lifeId: "life-nanxi-1",
      lifeTitle: "梅嶺風景區"
    },
    {
      id: "local-nanhua",
      districts: ["南化區"],
      theme: "地形與水岸",
      era: "1993–1999",
      title: "南化水庫的水，從哪一條溪來？",
      body: ["南化水庫築在曾文溪支流後堀溪上，1993 年主壩完工蓄水。1999 年甲仙攔河堰通水後，豐水期還可由高屏溪水系的旗山溪跨流域引水。今天面前這個湖，連著兩個流域與臺南、高雄的生活用水。"],
      refs: ["nanhua"],
      map: "historyMap",
      lifeId: "life-nanhua-1",
      lifeTitle: "南化水庫"
    },
    {
      id: "local-zuozhen",
      districts: ["左鎮區"],
      theme: "地形與水岸",
      era: "1978–1981",
      title: "光榮國小的文物室，怎麼變成一座化石館？",
      body: ["光榮國小師生長年到菜寮溪撿拾化石，收藏超過千件。1978 年學校成立鄉土文物室，讓更多人看到這些出土物，1981 年菜寮化石館正式啟用。今天園區也介紹採集者陳春木的故事。河床上的發現，靠居民、學校與研究者接力才保存下來。"],
      refs: ["fossil"],
      map: "historyMap",
      lifeId: "life-zuozhen-1",
      lifeTitle: "臺南左鎮化石園區"
    },
    {
      id: "local-guanmiao",
      districts: ["關廟區"],
      theme: "信仰與民俗",
      era: "1982 年",
      title: "到關廟買菜，也會經過彩繪師的作品",
      body: ["山西宮廟埕緊鄰關廟市場，買菜、吃點心和進廟都在同一段路上。1982 年新建廟宇時，邀請潘麗水、潘岳雄繪製門神和樑枋畫。從市場走到廟門口，不必進美術館，就能近看這些藝師留給地方的作品。"],
      refs: ["local-guanmiao"],
      map: "historyMap",
      lifeId: "life-guanmiao-1",
      lifeTitle: "關廟山西宮"
    },
    {
      id: "local-longqi",
      districts: ["龍崎區"],
      theme: "地形與水岸",
      era: "1998 年以來",
      title: "牛埔農塘的綠意，是怎麼長在泥岩上的？",
      body: ["龍崎埤仔溝溪集水區原有大片裸露泥岩。1998 年起，水保單位分期設土壩、土堤，在裸坡種植物，讓水與泥沙慢些往下游走。牛埔農塘今日可見的綠意與水面，記錄的是一處集水區逐步治理的過程。"],
      refs: ["local-longqi"],
      map: "historyMap",
      lifeId: "life-longqi-1",
      lifeTitle: "牛埔農塘與泥岩教學園區"
    }
  ];

  const districts = stories.filter(story => story.lifeId).map(story => story.districts[0]);
  const themes = [...new Set(stories.map(story => story.theme))];
  const mounted = new WeakMap();

  function linkTo(key) {
    const [label, url] = sources[key];
    const link = document.createElement('a');
    link.href = url;
    link.textContent = label;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    return link;
  }

  function mount(root, options = {}) {
    mounted.get(root)?.destroy();
    const area = document.createElement('section');
    area.className = 'atlas-stories';
    area.setAttribute('aria-label', '臺南地方故事');
    area.innerHTML = `
      <div class="as-filters">
        <label>行政區<select data-story-district></select></label>
        <label>故事主題<select data-story-theme></select></label>
      </div>
      <article class="as-article" data-story-article>
        <div class="as-meta"><span data-story-location></span><span data-story-era></span></div>
        <h3 data-story-title tabindex="-1"></h3>
        <div class="as-copy" data-story-body></div>
        <div class="as-actions" data-story-actions></div>
        <details class="as-sources" data-story-evidence>
          <summary>查閱本篇史料與圖資</summary>
          <ul data-story-sources></ul>
          <p data-story-credit></p>
        </details>
      </article>
      <nav class="as-pager" aria-label="翻閱地方故事">
        <button type="button" data-story-prev>上一則</button>
        <span data-story-count role="status" aria-live="polite"></span>
        <button type="button" data-story-next>下一則</button>
      </nav>`;
    root.replaceChildren(area);

    const get = name => area.querySelector('[data-story-' + name + ']');
    const districtSelect = get('district');
    const themeSelect = get('theme');
    const fullDistrict = name => districts.find(value => value === name || value.slice(0, -1) === name) || '';
    let district = fullDistrict(options.district);
    let theme = '';
    let index = 0;
    let list = [];

    function setOptions(select, first, choices, value) {
      select.replaceChildren(new Option(first, ''), ...choices.map(choice => new Option(choice, choice)));
      select.value = value;
    }

    function storyDistrict() {
      return district || list[index]?.districts[0] || '';
    }

    function render() {
      const story = list[index];
      const article = get('article');
      article.dataset.storyId = story.id;
      get('location').textContent = story.districts.join('、');
      get('era').textContent = story.era;
      get('title').textContent = story.title;
      get('body').replaceChildren(...story.body.map(paragraph => {
        const p = document.createElement('p');
        p.textContent = paragraph;
        return p;
      }));

      const links = [...story.refs, story.map];
      get('sources').replaceChildren(...links.map(ref => {
        const li = document.createElement('li');
        li.append(linkTo(ref));
        return li;
      }));
      get('credit').textContent = (story.lifeTitle ? '選題沿用生活地圖〈' + story.lifeTitle + '〉，依原件重新撰寫。' : '本篇為地方故事專題。') + '資料查核 ' + checkedAt + '。';
      get('evidence').open = false;
      const actions = get('actions');
      actions.replaceChildren();
      if (story.primaryLink) {
        const link = linkTo(story.primaryLink[0]);
        link.textContent = story.primaryLink[1];
        link.dataset.storyOriginal = '';
        actions.append(link);
      }
      if (options.onLayer && (story.map === 'geologyMap' || story.id === 'eastern-terrace')) {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.storyLayer = 'fault';
        button.textContent = '看活動斷層圖';
        button.onclick = () => options.onLayer('fault', storyDistrict());
        actions.append(button);
      }
      if (options.onCommunities) {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.storyCommunities = '';
        button.textContent = '看' + storyDistrict() + '社區';
        button.onclick = () => options.onCommunities(storyDistrict());
        actions.append(button);
      }
      get('count').textContent = '第 ' + (index + 1) + ' 則，共 ' + list.length + ' 則';
      get('prev').disabled = index === 0;
      get('next').disabled = index === list.length - 1;
    }

    function filter() {
      const inDistrict = district ? stories.filter(s => s.districts.includes(district)) : stories;
      const availableThemes = themes.filter(value => inDistrict.some(s => s.theme === value));
      if (!availableThemes.includes(theme)) theme = '';
      setOptions(themeSelect, '全部主題', availableThemes, theme);
      list = theme ? inDistrict.filter(s => s.theme === theme) : inDistrict;
      index = 0;
      render();
    }

    function setDistrict(name) {
      district = fullDistrict(name);
      districtSelect.value = district;
      theme = '';
      filter();
    }

    function turnPage(delta) {
      const nextIndex = index + delta;
      if (nextIndex < 0 || nextIndex >= list.length) return;
      index = nextIndex;
      render();
      options.onDistrict?.(storyDistrict(), { reason: 'story', storyId: list[index].id });
      get('title').focus({ preventScroll: true });
      get('title').scrollIntoView({ block: 'nearest' });
    }

    setOptions(districtSelect, '全臺南', districts, district);
    districtSelect.onchange = () => {
      setDistrict(districtSelect.value);
      options.onDistrict?.(district, { reason: 'filter', storyId: list[index].id });
    };
    themeSelect.onchange = () => {
      theme = themeSelect.value;
      filter();
      options.onDistrict?.(storyDistrict(), { reason: 'story', storyId: list[index].id });
    };
    get('prev').onclick = () => turnPage(-1);
    get('next').onclick = () => turnPage(1);
    filter();
    const api = {
      setDistrict,
      destroy() { area.remove(); if (mounted.get(root) === api) mounted.delete(root); }
    };
    mounted.set(root, api);
    return api;
  }

  window.AtlasStories = { mount, stories, sources, districts, checkedAt };
})();
