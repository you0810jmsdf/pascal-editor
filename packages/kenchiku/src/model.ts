import type { BearingKind } from './knowledge/bearing-ratios'

export type RoomKind =
  | 'living'
  | 'non-living'
  | 'kitchen'
  | 'toilet'
  | 'bath'
  | 'stair'
  | 'corridor'
  | 'storage'

/** 面積は㎡。parts は床+1.35mより上の見付面積の内訳。 */
export interface FacadeArea {
  storey: 1 | 2 | 3
  area: number
  parts: { label: string; width?: number; height?: number; area: number }[]
  notes?: string[]
}

/** 仕様書 §5.1・§7。未入力は判定時に input-needed とする。 */
export interface JpSiteInput {
  polygon?: Pt[]
  northRotation?: number
  zoning?:
    | 'R1-low'
    | 'R2-low'
    | 'R-garden'
    | 'R1-mid'
    | 'R2-mid'
    | 'R1'
    | 'R2'
    | 'quasi-R'
    | 'neighbor-com'
    | 'com'
    | 'quasi-ind'
    | 'ind'
    | 'ind-only'
    | 'none'
  kenpeiPct?: number
  yosekiPct?: number
  cornerLotBonus?: boolean
  fireZone?: 'none' | 'quasi' | 'fire' | 'art22'
  heightDistrict?: string
  absoluteHeightLimit?: number
  wallSetback?: number
  roads?: { edgeIndex: number; width: number; type: 'art42-1' | 'art42-2' | 'other' }[]
  shadowRegulation?: { measureHeight: number; hours5to10: number; hoursOver10: number }
  seismicC0?: 0.2 | 0.3
  windCoef?: number
  snow?: { depthCm: number; unitNPerM2PerCm: number }
  energyRegion?: number
  authority?: string
  notes?: string
}

export type Pt = [number, number] // 平面座標 (m)。建物座標系。x = X方向、y = Y方向
export type Dir = 'x' | 'y'

export interface JpOpening {
  u: number
  width: number
  bottom: number
  height: number
  kind: 'door' | 'window' | 'opening'
}
// u: 壁始点からの中心位置(m)。bottom: 壁基準面からの下端(m)

export interface JpBearingSpec {
  kind: BearingKind // §4.2 の列挙（'none' = 非耐力壁）
  ratioOverride?: number // 'custom' のとき倍率を直接入力
  faces?: 'one' | 'both' // 木ずり・面材の片面/両面
  braceLengthMm?: number // αh 用 Ld（省略時は区間長さ）
  components?: JpBearingSpec[] // combined の各仕様（倍率・筋かい方向を個別指定）
  braceTop?: 'start' | 'end' // 未設定時は両端に正の補正を適用
  quasi?: {
    kind: 'panel' | 'lath'
    panelHeightRatio: number
    position?: 'full' | 'hanging' | 'spandrel'
    clearHeight?: number // 垂れ壁・腰壁の高さ条件に用いる横架材内法(m)
  }
}
export interface JpWall {
  id: string
  start: Pt
  end: Pt
  thickness: number
  height: number
  openings: JpOpening[]
  bearing?: JpBearingSpec
  exterior?: boolean
  curveOffset?: number // 0以外の曲面壁は壁量集計外
}
export interface JpColumn {
  id: string
  at: Pt
  sizeMm?: [number, number]
  through?: boolean
} // 任意（柱ノードがある場合）
export interface JpRoom {
  id: string
  name: string
  polygon: Pt[]
  area: number
  kind: RoomKind
  ceilingHeight: number
  windows: JpOpening[]
  openableArea?: number
}

export interface JpStorey {
  index: 1 | 2 | 3
  height: number // 階高(m)（床〜上階床、最上階は床〜桁上端）
  horizontalMemberDistance?: number // Ho(m)。未指定時は§6.8の梁せいで近似
  floorPolygon: Pt[] // 壁芯で囲む床面積の外周（穴なし。吹抜けは holes に）
  holes?: Pt[][]
  floorArea: number // 法定床面積(㎡)。アダプタが polygon から算出して入れる
  walls: JpWall[]
  columns?: JpColumn[]
  rooms?: JpRoom[]
  stairs?: { riser: number; tread: number; width: number; id: string }[]
}

export interface JpRoof {
  kind: 'tile' | 'slate' | 'metal'
  rise: number /*最高高さ−軒高 m*/
  overhang: number /*軒の出 m*/
  pitchSun: number /*勾配(寸)*/
  silhouette?: { x: Pt[]; y: Pt[] } /*見付面積用の立面投影*/
}

export interface JpBuildingInput {
  storeys: JpStorey[]
  roof: JpRoof
  extWall: 'earthen' | 'mortar' | 'siding' | 'metal' | 'board'
  pv: { kind: 'none' | 'standard' | 'custom'; loadNPerM2?: number }
  ceilingInsulationNPerM2: number // 既定 100
  wallInsulationNPerM2: number // 既定 70
  use: 'house' | 'office' // 積載荷重の区分（既定 house）
  c0: 0.2 | 0.3 // 標準せん断力係数（令88条2項区域は0.3）
  windCoef: number // 風の必要壁量係数 cm/㎡（50〜75、既定50）
  snow?: { depthCm: number; unitNPerM2PerCm: number } // 多雪区域（等級2/3の参考計算にのみ使用）
  timber: { standard: string; species: string; grade: string; fc: number } // 既定 すぎ無等級 17.7
  minBearingLength: number // 耐力壁とみなす最小長さ m（既定 0.9）
  quasiWalls: boolean // 準耐力壁等を算入するか（既定 false）
  facade?: { x: FacadeArea[]; y: FacadeArea[] } // アダプタが計算した見付面積（階ごと）。無ければエンジンが bbox と roof から近似
  site?: JpSiteInput // §7 用
}
