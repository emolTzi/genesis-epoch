// 共享 GLSL 片段。

export const NOISE3D = /* glsl */ `
float hash31(vec3 p){ p=fract(p*0.3183099+vec3(0.1,0.2,0.3)); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float vnoise(vec3 x){
  vec3 i=floor(x); vec3 f=fract(x); f=f*f*(3.0-2.0*f);
  return mix(mix(mix(hash31(i),hash31(i+vec3(1,0,0)),f.x),mix(hash31(i+vec3(0,1,0)),hash31(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(hash31(i+vec3(0,0,1)),hash31(i+vec3(1,0,1)),f.x),mix(hash31(i+vec3(0,1,1)),hash31(i+vec3(1,1,1)),f.x),f.y),f.z);
}
float fbm(vec3 p){ float a=0.5; float s=0.0; for(int i=0;i<6;i++){ s+=a*vnoise(p); p=p*2.03+vec3(1.7,9.2,3.1); a*=0.5; } return s; }
float fbm4(vec3 p){ float a=0.5; float s=0.0; for(int i=0;i<4;i++){ s+=a*vnoise(p); p=p*2.07+vec3(5.1,1.3,7.7); a*=0.5; } return s; }
`;

/** 黑体近似颜色（1000–40000 K），用于恒星着色。 */
export function blackbody(tempK: number): [number, number, number] {
  const t = Math.min(40000, Math.max(1000, tempK)) / 100;
  let r: number;
  let g: number;
  let b: number;
  if (t <= 66) {
    r = 255;
    g = 99.4708025861 * Math.log(t) - 161.1195681661;
    b = t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  } else {
    r = 329.698727446 * Math.pow(t - 60, -0.1332047592);
    g = 288.1221695283 * Math.pow(t - 60, -0.0755148492);
    b = 255;
  }
  const c = (x: number) => Math.min(255, Math.max(0, x)) / 255;
  return [c(r), c(g), c(b)];
}
