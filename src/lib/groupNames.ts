import type { KekuleNamespace } from './kekule';

/**
 * Kekule ships its predefined substituent list with English names only, so the
 * "基团" tab of the atom picker shows bare abbreviations. Keyed by the
 * repository item name Kekule stores in `hint`.
 */
const GROUP_NAMES_ZH: Record<string, string> = {
  methyl: '甲基',
  ethyl: '乙基',
  'n-propyl': '正丙基',
  'i-propyl': '异丙基',
  'n-butyl': '正丁基',
  'i-butyl': '异丁基',
  's-butyl': '仲丁基',
  't-butyl': '叔丁基',
  phenyl: '苯基',
  benzyl: '苄基',
  benzoyl: '苯甲酰基',
  CF3: '三氟甲基',
  CCl3: '三氯甲基',
  CBr3: '三溴甲基',
  CI3: '三碘甲基',
  OMe: '甲氧基',
  OEt: '乙氧基',
  'Ot-Bu': '叔丁氧基',
  CO: '羰基',
  CHO: '甲酰基',
  carboxyl: '羧基',
  COOOH: '过氧羧基',
  COONa: '羧酸钠',
  COOK: '羧酸钾',
  COOCH3: '甲氧羰基',
  COOC2H5: '乙氧羰基',
  COCl: '氯甲酰基',
  COBr: '溴甲酰基',
  CONH2: '氨甲酰基',
  Ac: '乙酰基',
  OAc: '乙酰氧基',
  MeCO: '乙酰基',
  EtCO: '丙酰基',
  hydroxymethyl: '羟甲基',
  NMe2: '二甲氨基',
  nitro: '硝基',
  nitroso: '亚硝基',
  diazo: '重氮基',
  N2Cl: '氯化重氮基',
  N2Br: '溴化重氮基',
  'nitrile group': '氰基',
  pyridyl: '吡啶基',
  'sulfonic group': '磺酸基',
  SO2Cl: '氯磺酰基',
  SO2Br: '溴磺酰基',
  TMS: '三甲基硅基',
  OTMS: '三甲基硅氧基',
  OTs: '对甲苯磺酰氧基',
  MgCl: '氯化镁基',
  MgBr: '溴化镁基',
};

function stripTags(html: unknown) {
  return typeof html === 'string' ? html.replace(/<[^>]*>/g, '') : '';
}

/**
 * Hangs a Chinese name onto every predefined substituent so the picker button
 * reads "Me 甲基" instead of a bare abbreviation.
 */
export function installGroupNameTranslations(K: KekuleNamespace) {
  const prototype = K.ChemWidget?.StructureNodeSelectPanel?.prototype;
  if (!prototype || prototype.__zephyrleaGroupNames) return;

  prototype.__zephyrleaGroupNames = true;
  const originalGenerate = prototype.generateSelectableData;

  prototype.generateSelectableData = function generateSelectableData() {
    const data = originalGenerate?.call(this);
    const groups: any[] = data?.subGroupData ?? [];

    for (const info of groups) {
      const name = typeof info?.hint === 'string' ? GROUP_NAMES_ZH[info.hint] : undefined;
      if (!name) continue;

      info.description = name;
      info.hint = `${name} ${stripTags(info.text)}`.trim();
    }

    return data;
  };
}
