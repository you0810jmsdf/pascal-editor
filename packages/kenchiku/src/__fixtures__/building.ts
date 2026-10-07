import type { JpBuildingInput, JpStorey } from '../index'

export function building(): JpBuildingInput {
  const storey = (index: 1 | 2): JpStorey => ({ index, height: 3, floorArea: 60, floorPolygon: [[0, 0], [10, 0], [10, 6], [0, 6]], walls: [] })
  return {
    storeys: [storey(1), storey(2)],
    roof: { kind: 'slate', rise: 0.5, overhang: 0.5, pitchSun: 4 },
    extWall: 'siding', pv: { kind: 'standard' },
    ceilingInsulationNPerM2: 100, wallInsulationNPerM2: 70,
    use: 'house', c0: 0.2, windCoef: 50,
    timber: { standard: '無等級材', species: 'すぎ', grade: '無等級', fc: 17.7 },
    minBearingLength: 0.9, quasiWalls: false,
  }
}
