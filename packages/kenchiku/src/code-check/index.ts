import { type Explained, explained } from '../explain'
import { CODE_REFERENCES } from '../knowledge/code-references'
import type { JpBuildingInput } from '../model'
import { roomChecks } from './rooms'
import { siteChecks } from './site'
import type { CheckStatus, CodeCheck, CodeCheckReport } from './types'

export {
  checkCeilingHeight,
  checkDaylight,
  checkEnergy,
  checkFloorHeight,
  checkKitchenFinish,
  checkProcedure,
  checkStairs,
  checkVentilation,
  daylightFactor,
} from './rooms'
export {
  checkAbsoluteHeight,
  checkFireSpread,
  checkKenpei,
  checkNorthSlope,
  checkRoad,
  checkRoadSlope,
  checkShadow,
  checkWallSetback,
  checkYoseki,
} from './site'
export type { CheckStatus, CodeCheck, CodeCheckReport } from './types'

const STATUSES: CheckStatus[] = ['ok', 'ng', 'warn', 'n/a', 'input-needed']

/** 仕様書 §7：構造以外の建築法チェック一式。入力が無い項目は input-needed で返し、無理に判定しない。 */
export function checkBuildingCode(input: JpBuildingInput): Explained<CodeCheckReport> {
  const checks: CodeCheck[] = [...siteChecks(input), ...roomChecks(input)]
  const counts = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<CheckStatus, number>
  for (const c of checks) counts[c.status] += 1
  const ok = counts.ng === 0 && counts['input-needed'] === 0
  return explained(
    { checks, counts, ok },
    '集団規定（接道・建蔽率・容積率・高さ・斜線・日影・防火）と単体規定（採光・換気・天井高・階段・床高・内装）、省エネ、手続きを個別に判定',
    `ok ${counts.ok} / ng ${counts.ng} / warn ${counts.warn} / n/a ${counts['n/a']} / input-needed ${counts['input-needed']}`,
    [CODE_REFERENCES.procedure, CODE_REFERENCES.procedureRule],
    [
      'warn は「判定はしたが人の確認・追加の検討が要る」、input-needed は「入力が無いので判定していない」。',
    ],
  )
}
