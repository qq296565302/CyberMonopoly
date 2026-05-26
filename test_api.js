const https = require('https');

function fetch(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: { 'Referer': 'https://finance.sina.com.cn/', 'User-Agent': 'Mozilla/5.0' },
      timeout: 8000
    }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    }).on('error', reject);
  });
}

function fetchBuf(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: { 'Referer': 'https://finance.sina.com.cn/', 'User-Agent': 'Mozilla/5.0' },
      timeout: 8000
    }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', reject);
  });
}

async function main() {
  const indexCodes = ['sh000001', 'sz399001'];
  let todayIndexAmount = 0;
  let todayIndexVolume = 0;
  let yesterdayIndexVolume = 0;

  for (const code of indexCodes) {
    const minuteUrl = `https://web.ifzq.gtimg.cn/appstock/app/minute/query?code=${code}`;
    const buf = await fetchBuf(minuteUrl);
    const text = buf.toString('utf-8');
    const data = JSON.parse(text);
    const stockData = data.data?.[code];
    if (!stockData) continue;

    const minuteData = stockData.data?.data || [];
    if (minuteData.length > 0) {
      const lastParts = minuteData[minuteData.length - 1].split(' ');
      todayIndexVolume += parseFloat(lastParts[2]) || 0;
      todayIndexAmount += parseFloat(lastParts[3]) || 0;
    }

    const klineUrl = `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?code=${code}&_var=kline_day&param=${code},day,,,3,qfq`;
    const klineText = await fetch(klineUrl);
    const jsonMatch = klineText.match(/\{.*\}/s);
    if (jsonMatch) {
      const klineData = JSON.parse(jsonMatch[0]);
      const dayArr = klineData.data?.[code]?.day || klineData.data?.[code]?.qfqday;
      if (dayArr && dayArr.length >= 2) {
        const yesterdayEntry = dayArr[dayArr.length - 2];
        yesterdayIndexVolume += parseFloat(yesterdayEntry[5]) || 0;
        console.log(`${code} yesterday: date=${yesterdayEntry[0]} volume=${yesterdayEntry[5]}`);
      }
    }
  }

  console.log(`\nToday index: volume=${todayIndexVolume} amount=${todayIndexAmount}`);
  console.log(`Yesterday index: volume=${yesterdayIndexVolume}`);

  const avgPricePerVol = todayIndexAmount / todayIndexVolume;
  const yesterdayIndexAmount = yesterdayIndexVolume * avgPricePerVol;
  console.log(`\navgPricePerVol = ${avgPricePerVol.toFixed(4)}`);
  console.log(`Estimated yesterday total amount = ${yesterdayIndexAmount.toFixed(0)} (${(yesterdayIndexAmount / 1e8).toFixed(2)}亿)`);

  // Simulate at 14:00 (3.5 hours into trading = 210 minutes)
  const elapsedMinutes = 210;
  const timeProportion = elapsedMinutes / 240;
  const yesterdayAmountAtSameTime = yesterdayIndexAmount * timeProportion;
  console.log(`\nAt 14:00 (proportion=${(timeProportion * 100).toFixed(1)}%):`);
  console.log(`  Yesterday same-time amount = ${yesterdayAmountAtSameTime.toFixed(0)} (${(yesterdayAmountAtSameTime / 1e8).toFixed(2)}亿)`);

  // Get actual today's market turnover from Sina
  const buf = await fetchBuf('https://hq.sinajs.cn/list=sh000001,sz399001');
  const text = new TextDecoder('gbk').decode(buf);
  const lines = text.split('\n').filter(l => l.trim());
  let totalAmount = 0;
  for (const line of lines) {
    const m = line.match(/hq_str_(\w+)="(.*)"/);
    if (m) {
      const parts = m[2].split(',');
      totalAmount += parseFloat(parts[9]) || 0;
    }
  }
  console.log(`\nActual today index amount = ${totalAmount} (${(totalAmount / 1e8).toFixed(2)}亿)`);
  console.log(`Tencent minute amount = ${todayIndexAmount} (${(todayIndexAmount / 1e8).toFixed(2)}亿)`);

  const ratio = totalAmount / todayIndexAmount;
  const diff = Math.round(totalAmount - yesterdayAmountAtSameTime * ratio);
  console.log(`\nRatio (total/market) = ${ratio.toFixed(4)}`);
  console.log(`Estimated turnover diff = ${diff} (${(diff / 1e8).toFixed(2)}亿)`);
}

main().catch(e => console.log('ERR:', e.message));
