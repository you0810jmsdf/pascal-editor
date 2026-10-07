import type { Reference } from '../explain'
import { EFFECTIVE_DATE } from './references'

const LAW = 'https://laws.e-gov.go.jp/law/325AC0000000201'
const ORDER = 'https://laws.e-gov.go.jp/law/325CO0000000338'

const ref = (law: string, article: string, url: string): Reference => ({
  law,
  article,
  url,
  effectiveDate: EFFECTIVE_DATE,
})

/** 仕様書 §7 の各チェックが引く条文（e-Gov の法令ページ。条アンカーは Mp-At_<条>）。 */
export const CODE_REFERENCES = {
  road: ref('建築基準法', '第42条・第43条（接道義務）', `${LAW}#Mp-At_43`),
  kenpei: ref('建築基準法', '第53条（建蔽率）', `${LAW}#Mp-At_53`),
  yoseki: ref('建築基準法', '第52条（容積率）', `${LAW}#Mp-At_52`),
  absoluteHeight: ref('建築基準法', '第55条（低層住居専用地域等の高さの限度）', `${LAW}#Mp-At_55`),
  wallSetback: ref('建築基準法', '第54条（外壁の後退距離）', `${LAW}#Mp-At_54`),
  roadSlope: ref('建築基準法', '第56条第1項第1号（道路斜線）・別表第3', `${LAW}#Mp-At_56`),
  neighborSlope: ref('建築基準法', '第56条第1項第2号（隣地斜線）', `${LAW}#Mp-At_56`),
  northSlope: ref('建築基準法', '第56条第1項第3号（北側斜線）', `${LAW}#Mp-At_56`),
  shadow: ref('建築基準法', '第56条の2・別表第4（日影規制）', `${LAW}#Mp-At_56_2`),
  fireSpread: ref('建築基準法', '第2条第6号（延焼のおそれのある部分）・第61条', `${LAW}#Mp-At_61`),
  heightDistrict: ref('都市計画法・建築基準法', '第58条（高度地区）', `${LAW}#Mp-At_58`),
  daylight: ref('建築基準法・施行令', '法第28条第1項・令第20条（採光）', `${ORDER}#Mp-At_20`),
  ventilation: ref('建築基準法', '第28条第2項（換気）', `${LAW}#Mp-At_28`),
  ceiling: ref('建築基準法施行令', '第21条（居室の天井の高さ）', `${ORDER}#Mp-At_21`),
  floorHeight: ref('建築基準法施行令', '第22条（居室の床の高さ及び防湿方法）', `${ORDER}#Mp-At_22`),
  stair: ref(
    '建築基準法施行令',
    '第23条（階段及びその踊場の幅並びに階段の蹴上げ及び踏面の寸法）',
    `${ORDER}#Mp-At_23`,
  ),
  kitchenFinish: ref(
    '建築基準法施行令',
    '第128条の4第4項（火気使用室の内装制限）',
    `${ORDER}#Mp-At_128_4`,
  ),
  energy: ref(
    '建築物のエネルギー消費性能の向上等に関する法律',
    '第10条（建築物エネルギー消費性能適合性判定・2025-04-01 全面義務化）',
    'https://laws.e-gov.go.jp/law/427AC0000000053',
  ),
  procedure: ref('建築基準法', '第6条（建築物の建築等に関する申請及び確認）', `${LAW}#Mp-At_6`),
  procedureRule: ref(
    '建築基準法施行規則',
    '第1条の3（確認申請書の添付図書）',
    'https://laws.e-gov.go.jp/law/325M50004000040',
  ),
  inzai: ref(
    '印西市（限定特定行政庁）',
    '2階以下・延べ300㎡以下・高さ16m以下は市の建築指導係、超える規模は千葉県印旛土木事務所',
    'https://www.city.inzai.lg.jp/0000000193.html',
  ),
} as const satisfies Record<string, Reference>
