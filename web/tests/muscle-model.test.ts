// El modelo 3D (`public/models/muscles.glb.gz`) lo genera
// `scripts/gen-muscle-model.ts` a partir de BodyParts3D. Este test ata el
// fichero publicado al vocabulario: una malla por sub-región de la API, con su
// grupo, sin posiciones corruptas y con la atribución CC BY junto a él.
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { MUSCLE_REGION_GROUPS } from "../../api/src/muscle-regions";

const DIR = "public/models/";

type Gltf = {
  nodes: { name: string; mesh: number; extras?: Record<string, string> }[];
  meshes: { primitives: { attributes: Record<string, number> }[] }[];
  accessors: { min?: number[]; max?: number[] }[];
};

function readGlb(): Gltf {
  const bin = gunzipSync(readFileSync(`${DIR}muscles.glb.gz`));
  expect(bin.readUInt32LE(0)).toBe(0x46546c67); // «glTF»
  const length = bin.readUInt32LE(12);
  return JSON.parse(bin.subarray(20, 20 + length).toString("utf8"));
}

describe("modelo 3D de los músculos", () => {
  const gltf = readGlb();

  it("trae una malla por sub-región del vocabulario, con su grupo", () => {
    const regions = gltf.nodes.filter((n) => n.extras?.region);
    expect(regions.map((n) => n.extras?.region).sort()).toEqual(
      Object.keys(MUSCLE_REGION_GROUPS).sort(),
    );
    for (const n of regions)
      expect(n.extras?.group, n.name).toBe(
        MUSCLE_REGION_GROUPS[n.extras?.region ?? ""],
      );
  });

  it("ninguna posición es NaN ni infinita", () => {
    for (const n of gltf.nodes) {
      const a =
        gltf.accessors[gltf.meshes[n.mesh].primitives[0].attributes.POSITION];
      for (const v of [...(a.min ?? []), ...(a.max ?? [])])
        expect(Number.isFinite(v), n.name).toBe(true);
    }
  });

  it("lleva la atribución de BodyParts3D (CC BY 4.0)", () => {
    const text = readFileSync(`${DIR}ATTRIBUTION.md`, "utf8");
    expect(text).toMatch(/BodyParts3D/);
    expect(text).toMatch(/CC BY 4\.0|Attribution 4\.0/);
  });
});
