import { test, expect } from "@playwright/test";
import shpwrite from "@mapbox/shp-write";
import { unzipSync, zipSync } from "fflate";
import {
  collection,
  feature,
  square,
  polygon,
  invalid,
  point,
  line,
} from "../fixtures/geometries.mjs";

const upload = (page, layer, features, name = "area.geojson") =>
  page
    .getByLabel(`Selecionar arquivos da camada ${layer}`)
    .setInputFiles({
      name,
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(collection(features))),
    });
test.beforeEach(async ({ page }) => {
  // Sem dependência da disponibilidade do servidor de tiles nos testes.
  await page.route("https://tile.openstreetmap.org/**", (route) =>
    route.abort(),
  );
  await page.goto("/");
});
test("GeoJSON → worker → mapa clicável → comparação → troca de arquivo", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await upload(page, "A", [polygon]);
  await expect(
    page.getByText("1 features lidas · 1 disponíveis no mapa"),
  ).toBeVisible();
  await expect(
    page.getByText("123,0907 ha", { exact: true }).first(),
  ).toBeVisible();
  const canvas = page.locator(".map-canvas canvas");
  await expect(canvas).toBeVisible();
  // Um clique interrompe a animação do mapa; espere o enquadramento aproximar.
  await expect(page.locator(".maplibregl-ctrl-scale")).toHaveText(/^\d+\s+m$/, {
    timeout: 15000,
  });
  await expect(async () => {
    await canvas.click({ position: { x: 683, y: 245 } });
    await expect(
      page.getByRole("heading", { name: "Inspeção · Camada A" }),
    ).toBeVisible({ timeout: 1500 });
  }).toPass({ timeout: 15000 });
  await expect(page.getByText("Área de teste", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Fechar inspeção" }).click();
  await upload(page, "B", [feature(square(0.005))]);
  await expect(
    page.getByText("1 features lidas · 1 disponíveis no mapa"),
  ).toHaveCount(2);
  await page.getByRole("button", { name: "Comparar camadas" }).click();
  await expect(
    page.getByText("Sobreposição detectada", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("50%", { exact: true })).toHaveCount(2);
  await page.getByLabel("Exibir no mapa").selectOption("onlyA");
  await page.screenshot({
    path: "test-results/lsgeo-comparison.png",
    fullPage: true,
  });
  await page
    .getByLabel("Selecionar arquivos da camada A")
    .setInputFiles({
      name: "erro.json",
      mimeType: "application/json",
      buffer: Buffer.from("{"),
    });
  await expect(page.locator("p[role=alert]")).toContainText("JSON inválido");
  await expect(
    page.getByText("Sobreposição detectada", { exact: true }),
  ).toHaveCount(0);
  expect(errors).toEqual([]);
});
test("Shapefile ZIP no navegador e bloqueio por CRS ausente", async ({
  page,
}) => {
  const bytes = new Uint8Array(
    await shpwrite.zip(collection([polygon]), { outputType: "arraybuffer" }),
  );
  await page
    .getByLabel("Selecionar arquivos da camada A")
    .setInputFiles({
      name: "area.zip",
      mimeType: "application/zip",
      buffer: Buffer.from(bytes),
    });
  await expect(
    page.getByText("1 features lidas · 1 disponíveis no mapa"),
  ).toBeVisible();
  await expect(page.getByText("Shapefile", { exact: true })).toBeVisible();
  const entries = unzipSync(bytes);
  delete entries[Object.keys(entries).find((name) => name.endsWith(".prj"))];
  await page
    .getByLabel("Selecionar arquivos da camada B")
    .setInputFiles({
      name: "sem-crs.zip",
      mimeType: "application/zip",
      buffer: Buffer.from(zipSync(entries)),
    });
  await expect(
    page.getByText("1 features lidas · 0 disponíveis no mapa"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Comparar camadas" }).click();
  await expect(page.locator("p[role=alert]")).toContainText(
    "Comparação bloqueada",
  );
});
test("diagnósticos, coleção vazia, reenvio e layout móvel", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await upload(page, "A", [invalid, feature(null), point, line]);
  await expect(
    page.getByText("4 features lidas · 2 disponíveis no mapa"),
  ).toBeVisible();
  await expect(page.getByText(/Autointerseção ou cruzamento/)).toBeVisible();
  await upload(page, "A", [], "area.geojson");
  await expect(
    page.getByText("0 features lidas · 0 disponíveis no mapa"),
  ).toBeVisible();
  await upload(page, "A", [polygon], "area.geojson");
  await expect(
    page.getByText("1 features lidas · 1 disponíveis no mapa"),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await expect(page.locator(".maplibregl-ctrl-scale")).toHaveText(/^\d+\s+m$/);
  await page.screenshot({
    path: "test-results/lsgeo-mobile.png",
    fullPage: true,
  });
});
