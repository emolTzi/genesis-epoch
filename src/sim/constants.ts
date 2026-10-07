// 物理常数与参考值。每一项都注明出处，便于审校。

/** 太阳有效温度，K（IAU 2015 Resolution B3 名义值）。 */
export const T_SUN = 5772;
/** 太阳名义半径，m（IAU 2015 B3）。 */
export const R_SUN = 6.957e8;
/** 太阳名义光度，W（IAU 2015 B3）。 */
export const L_SUN = 3.828e26;
/** 天文单位，m（IAU 2012 B2）。 */
export const AU = 1.495978707e11;
/** 斯特藩–玻尔兹曼常数，W·m⁻²·K⁻⁴（CODATA 2018）。 */
export const SIGMA = 5.670374419e-8;
/** 精细结构常数（CODATA 2018）。 */
export const ALPHA = 7.2973525693e-3;
/** 强相互作用耦合常数在 Z 玻色子能标处的世界平均值（PDG 2022）。 */
export const ALPHA_S_MZ = 0.1179;
/** ¹²C 霍伊尔态（0₂⁺）激发能，MeV。 */
export const HOYLE_MEV = 7.654;
/** 暗能量密度参数 Ω_Λ（Planck 2018）。 */
export const OMEGA_LAMBDA = 0.6889;
/** 地球邦德反照率（NASA 地球数据表约 0.306，作品取 0.30）。 */
export const EARTH_ALBEDO = 0.3;
/** 地球现值温室增温，K（平均地表约 288 K 减平衡温度约 255 K）。 */
export const EARTH_GREENHOUSE = 33;
/** 地球逃逸速度，km/s。 */
export const V_ESC_EARTH = 11.186;
/** 保守宜居带有效辐照度边界（Kopparapu et al. 2013，类日恒星）：湿温室内缘。 */
export const SEFF_INNER = 1.015;
/** 保守宜居带外缘：最大温室极限。 */
export const SEFF_OUTER = 0.356;
/** 平衡气候敏感度：CO₂ 加倍增温约 3 K（IPCC AR6 最佳估计）。 */
export const ECS_PER_DOUBLING = 3;
/** 硅酸盐风化的温度 e 折尺度，K（Walker, Hays & Kasting 1981 的取值量级）。 */
export const WEATHERING_TE = 13.7;
/** 风化速率对 CO₂ 分压的幂指数（示意取值）。 */
export const WEATHERING_BETA = 0.3;
/** 地球从形成到出现智人约用时，Gyr。 */
export const EARTH_TIME_TO_HUMANS_GYR = 4.54;
/** 水在 1 个标准大气压下的冰点与沸点，K。 */
export const T_FREEZE = 273.15;
export const T_BOIL = 373.15;
