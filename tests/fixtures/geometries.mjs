export const feature = (geometry) => ({
  type: "Feature",
  properties: { nome: "Área de teste", numero: 7 },
  geometry,
});
export const square = (x = 0, y = 0, size = 0.01) => ({
  type: "Polygon",
  coordinates: [
    [
      [x, y],
      [x + size, y],
      [x + size, y + size],
      [x, y + size],
      [x, y],
    ],
  ],
});
export const polygon = feature(square());
export const multiPolygon = feature({
  type: "MultiPolygon",
  coordinates: [square().coordinates, square(0.02).coordinates],
});
export const line = feature({
  type: "LineString",
  coordinates: [
    [0, 0],
    [0.01, 0],
  ],
});
export const point = feature({ type: "Point", coordinates: [0, 0] });
export const hole = feature({
  type: "Polygon",
  coordinates: [
    ...square(0, 0, 0.02).coordinates,
    ...square(0.005, 0.005, 0.01).coordinates,
  ],
});
export const overlapping = [polygon, feature(square(0.005))];
export const disjoint = [polygon, feature(square(0.02))];
export const invalid = feature({
  type: "Polygon",
  coordinates: [
    [
      [0, 0],
      [0.01, 0.01],
      [0, 0.01],
      [0.01, 0],
      [0, 0],
    ],
  ],
});
export const nullGeometry = feature(null);
export const collection = (features) => ({
  type: "FeatureCollection",
  features,
});
