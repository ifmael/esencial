// Renderizadores WebGL por software (sin GPU): SwiftShader (Chrome), llvmpipe
// (Mesa, Linux) y Microsoft Basic Render (Windows). Con ellos el visor 3D
// bloquea la página segundos en una máquina modesta —así se congelaba el CI—,
// y es mejor el mapa SVG. Un renderizador que el navegador no revela (Firefox
// con `resistFingerprinting`, algunos Safari) no cuenta como software.
// Lo usan el visor y los e2e, que así saltan los tests del 3D sin GPU.
const SOFTWARE =
  /swiftshader|llvmpipe|softpipe|software|microsoft basic render/i;

export function isSoftwareRenderer(name: string | null | undefined): boolean {
  return SOFTWARE.test(name ?? "");
}
