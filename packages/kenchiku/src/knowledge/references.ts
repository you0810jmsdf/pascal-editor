import type { Reference } from '../explain'

// 仕様書 §0.4・§4.5・付録A。改正基準の施行日（ツールの版日は別記）。
export const EFFECTIVE_DATE = '2025-04-01'
export const REFERENCES = {
  wall: {
    law: '建築基準法施行令',
    article: '第46条第4項',
    url: 'https://laws.e-gov.go.jp/law/325CO0000000338#Mp-At_46',
    effectiveDate: EFFECTIVE_DATE,
  },
  column: {
    law: '建築基準法施行令',
    article: '第43条',
    url: 'https://laws.e-gov.go.jp/law/325CO0000000338#Mp-At_43',
    effectiveDate: EFFECTIVE_DATE,
  },
  liveLoad: {
    law: '建築基準法施行令',
    article: '第85条',
    url: 'https://laws.e-gov.go.jp/law/325CO0000000338#Mp-At_85',
    effectiveDate: EFFECTIVE_DATE,
  },
  seismic: {
    law: '建築基準法施行令',
    article: '第88条',
    url: 'https://laws.e-gov.go.jp/law/325CO0000000338#Mp-At_88',
    effectiveDate: EFFECTIVE_DATE,
  },
  guidance: {
    law: '技術的助言 国住指第425号',
    article: '第4（告示1100号・1349号の改正）',
    url: 'https://www.mlit.go.jp/common/001877517.pdf',
    effectiveDate: EFFECTIVE_DATE,
  },
  howtec: {
    law: 'HOWTEC 在来軸組工法用 表計算ツール（2025-12版）',
    article: '壁量・柱の小径（告示1100号・1349号）',
    url: 'https://www.howtec.or.jp/publics/index/411/',
    effectiveDate: EFFECTIVE_DATE,
  },
  nValue: {
    law: '平成12年建設省告示第1460号',
    article: '第2号 表三・表四',
    url: 'https://www.mlit.go.jp/jutakukentiku/build/s20000523/n026.pdf',
    effectiveDate: EFFECTIVE_DATE,
  },
} as const satisfies Record<string, Reference>
