const https = require('https');
function fetch(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'Referer': 'https://emweb.securities.eastmoney.com',
        'User-Agent': 'Mozilla/5.0'
      }
    }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks).toString()));
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function test() {
  // Test stock/get for Shanghai Composite with distribution fields
  const secids = [
    { name: '上证指数', secid: '1.000001' },
    { name: '深证综指', secid: '0.399106' },
    { name: '深证成指', secid: '0.399001' },
  ];

  for (const idx of secids) {
    try {
      console.log(`=== ${idx.name} (${idx.secid}) ===`);
      const r = await fetch('https://push2.eastmoney.com/api/qt/stock/get?secid=' + idx.secid + '&fields=f43,f104,f105,f106,f107,f108,f6,f169,f170&_=' + Date.now());
      const d = JSON.parse(r);
      const data = d && d.data;
      if (data) {
        console.log('  f43(价格)=', data.f43, ' f104(涨)=', data.f104, ' f105(跌)=', data.f105, ' f106(平)=', data.f106, ' f107(涨停)=', data.f107, ' f108(跌停)=', data.f108, ' f6(成交额)=', data.f6);
      } else {
        console.log('  无数据');
      }
    } catch(e) {
      console.log('  失败:', e.message);
    }
    await sleep(2000);
  }

  // Test clist API for counting up/down/flat stocks
  try {
    console.log('\n=== 用clist统计涨跌家数 ===');
    const url = 'https://push2.eastmoney.com/api/qt/clist/get?cb=&pn=1&pz=1&po=1&np=1&ut=bd1d9ddb04089700cf9c27f6f7426281&fltt=2&invt=2&fid=f3&fs=m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23,m:0+t:81+s:2048&fields=f2,f3,f12,f14&_=' + Date.now();
    const r = await fetch(url);
    const d = JSON.parse(r);
    console.log('A股总数:', d && d.data ? d.data.total : 0);
  } catch(e) {
    console.log('clist统计失败:', e.message);
  }
}

test().catch(console.error);
