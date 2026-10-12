import { createServer } from "node:http";

const host = process.env.AVERON_FIXTURE_HOST ?? "127.0.0.1";
const port = Number(process.env.AVERON_FIXTURE_PORT ?? 4200);
const adminOrigin = process.env.AVERON_ADMIN_ORIGIN ?? "http://127.0.0.1:3200";
const requests = [];
const products = new Map();
const promoCodes = new Map();
const fittingAssets = new Map();
const now = new Date().toISOString();
const adminUser = {
  id: "fixture-admin",
  email: "admin@averon.local",
  name: "Fixture Admin",
  role: "ADMIN",
  adminRole: "SUPER_ADMIN",
  isActive: true,
};

function seedProduct(id, title) {
  const isReviewFixture = id === "fixture-review-shirt";
  return {
    id,
    slug: id,
    publicId: isReviewFixture ? "AVR-000000000000001" : "AVR-000000000000002",
    country: "CN",
    source: "MANUAL",
    translations: { ru: { title }, uz: { title }, en: { title } },
    description: { ru: "Локальный тестовый товар" },
    material: isReviewFixture ? "Хлопок 100%." : null,
    attributes: isReviewFixture ? {
      careInstructions: { ru: "Машинная стирка, не использовать сушильную машину" },
    } : {},
    sizeChartType: isReviewFixture ? "CLOTHING" : null,
    sizeChart: isReviewFixture ? [{ size: "M", chestCm: 96, lengthCm: 68 }] : [],
    images: isReviewFixture ? [{
      id: "fixture-review-shirt-image",
      url: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 500'%3E%3Crect width='400' height='500' fill='%23e8eef7'/%3E%3Cpath d='M130 105 175 75h50l45 30 55 65-48 38-32-38v215H155V170l-32 38-48-38z' fill='%232563eb'/%3E%3C/svg%3E",
      alt: { ru: title, uz: title, en: title },
    }] : [],
    variants: isReviewFixture
      ? [
          { id: "fixture-variant-m", color: "dark blue::#000080", size: "M", stock: 5, available: true },
          { id: "fixture-variant-l", color: "Red::#ff0000", size: "L", stock: 2, available: true },
        ]
      : [{ id: `${id}-variant`, color: "#204080", size: "M", stock: 5, available: true }],
    salePriceUzs: 180000,
    status: "PUBLISHED",
    publishedAt: now,
    _count: { favoriteLinks: 0, recentlyViewedRecords: 0, reviews: 0 },
  };
}

products.set("fixture-review-shirt", seedProduct("fixture-review-shirt", "GLB review fixture shirt"));
products.set("fixture-blue-jacket", seedProduct("fixture-blue-jacket", "Fixture blue jacket"));

function toPublicProduct(product) {
  return product.id === "fixture-review-shirt"
    ? { ...product, id: "fixture-product-review", slug: "fixture-product-review" }
    : product;
}

function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [
    key,
    /password|token|secret|cookie|authorization/i.test(key) ? "[REDACTED]" : redact(item),
  ]));
}

async function readBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 2 * 1024 * 1024) throw new Error("Request body too large");
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return undefined;
  try { return JSON.parse(raw); } catch { return { rawBodyBytes: Buffer.byteLength(raw) }; }
}

function respond(response, status, body, extraHeaders = {}) {
  response.writeHead(status, {
    "access-control-allow-origin": adminOrigin,
    "access-control-allow-credentials": "true",
    "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "access-control-allow-headers": "Authorization, Content-Type, Idempotency-Key",
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...extraHeaders,
  });
  response.end(JSON.stringify(body));
}

function page(items) {
  return { items, pagination: { page: 1, limit: 100, total: items.length, pages: 1 } };
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://${host}:${port}`);
  if (request.method === "OPTIONS") return respond(response, 204, {});

  let body;
  try { body = await readBody(request); } catch {
    return respond(response, 413, { message: "Request body too large" });
  }
  if (url.pathname !== "/__fixture/requests") {
    requests.push({
      method: request.method,
      path: url.pathname,
      body: redact(body),
      ...(url.searchParams.has("layer") ? { layer: url.searchParams.get("layer") } : {}),
      ...(url.searchParams.has("variantId") ? { variantId: url.searchParams.get("variantId") } : { variantId: null }),
      ...((body?.rawBodyBytes ?? Number(request.headers["content-length"] ?? 0)) > 0
        ? { bytes: body?.rawBodyBytes ?? Number(request.headers["content-length"]) }
        : {}),
      ...(request.headers["idempotency-key"] ? { key: request.headers["idempotency-key"] } : {}),
    });
  }

  if (request.method === "GET" && url.pathname === "/__fixture/requests") {
    return respond(response, 200, { requests });
  }
  const fixtureProductMatch = url.pathname.match(/^\/__fixture\/products\/([^/]+)$/);
  if (fixtureProductMatch && request.method === "DELETE") {
    const id = decodeURIComponent(fixtureProductMatch[1]);
    return products.delete(id)
      ? respond(response, 200, { success: true })
      : respond(response, 404, { message: "Not found" });
  }
  if (request.method === "POST" && url.pathname === "/auth/refresh") {
    if (!request.headers.cookie?.includes("fixture_refresh=fixture-refresh-token")) {
      return respond(response, 401, { message: "Authentication required" });
    }
    return respond(response, 200, { accessToken: "fixture-access-token" });
  }
  if (request.method === "POST" && url.pathname === "/auth/login") {
    return respond(response, 200, { accessToken: "fixture-access-token", user: adminUser }, {
      "set-cookie": "fixture_refresh=fixture-refresh-token; HttpOnly; SameSite=Lax; Path=/",
    });
  }
  if (request.method === "GET" && url.pathname === "/auth/me") {
    if (!request.headers.cookie?.includes("fixture_refresh=fixture-refresh-token")
      || (request.headers.origin && request.headers.origin !== adminOrigin)) {
      return respond(response, 401, { message: "Authentication required" });
    }
    return respond(response, 200, adminUser);
  }

  if (url.pathname === "/api/v1/products" && request.method === "GET") {
    return respond(response, 200, page([...products.values()]
      .filter((product) => product.status === "PUBLISHED")
      .map(toPublicProduct)));
  }
  const publicProductMatch = url.pathname.match(/^\/api\/v1\/products\/([^/]+)$/);
  if (publicProductMatch && request.method === "GET") {
    const identifier = decodeURIComponent(publicProductMatch[1]);
    const product = [...products.values()].find((candidate) =>
      candidate.id === identifier || candidate.slug === identifier || candidate.publicId === identifier
        || (candidate.id === "fixture-review-shirt" && identifier === "fixture-product-review"),
    );
    return product ? respond(response, 200, toPublicProduct(product)) : respond(response, 404, { message: "Not found" });
  }

  if (url.pathname === "/api/v1/admin/products" && request.method === "GET") {
    return respond(response, 200, page([...products.values()]));
  }
  if (url.pathname === "/api/v1/admin/products" && request.method === "POST") {
    const id = `fixture-product-${products.size + 1}`;
    const product = { ...seedProduct(id, body?.title ?? "Fixture product"), ...body };
    products.set(id, product);
    return respond(response, 201, product);
  }
  const fittingAssetsMatch = url.pathname.match(/^\/api\/v1\/admin\/products\/([^/]+)\/fitting-room\/assets$/);
  if (fittingAssetsMatch && request.method === "GET") {
    return respond(response, 200, [...fittingAssets.values()].filter((asset) => asset.productId === decodeURIComponent(fittingAssetsMatch[1])));
  }
  if (fittingAssetsMatch && request.method === "POST") {
    const productId = decodeURIComponent(fittingAssetsMatch[1]);
    const asset = {
      id: "fixture-glb-uploaded",
      productId,
      variantId: url.searchParams.get("variantId") || null,
      fileSize: body?.rawBodyBytes ?? 128,
      status: "NEEDS_REVIEW",
      source: "MANUAL",
      garmentLayer: url.searchParams.get("layer") ?? "BASE_TOP",
      mannequinVersion: "fixture-v1",
      modelVersion: "fixture-v1",
      validationSummary: "Local upload fixture accepted for workflow testing",
      validationDetails: {},
      positionX: 0,
      positionY: 0,
      positionZ: 0,
      scale: 1,
      rejectionReason: null,
      previewUrl: null,
      variant: null,
      createdAt: now,
    };
    fittingAssets.set(asset.id, asset);
    return respond(response, 201, asset);
  }
  if (url.pathname === "/api/v1/admin/fitting-room/generation-capabilities" && request.method === "GET") {
    return respond(response, 200, { enabled: false, localWorkerConfigured: false });
  }
  const generationJobsMatch = url.pathname.match(/^\/api\/v1\/admin\/products\/([^/]+)\/fitting-room\/generation-jobs$/);
  if (generationJobsMatch && request.method === "GET") return respond(response, 200, []);
  const fittingReviewMatch = url.pathname.match(/^\/api\/v1\/admin\/fitting-room\/assets\/([^/]+)\/review$/);
  if (fittingReviewMatch && request.method === "POST") {
    const asset = fittingAssets.get(decodeURIComponent(fittingReviewMatch[1]));
    if (!asset) return respond(response, 404, { message: "Not found" });
    const updated = { ...asset, status: body?.action === "approve" ? "APPROVED" : "REJECTED", rejectionReason: body?.rejectionReason ?? null };
    fittingAssets.set(updated.id, updated);
    return respond(response, 200, updated);
  }
  const productMatch = url.pathname.match(/^\/api\/v1\/admin\/products\/([^/]+)$/);
  if (productMatch) {
    const id = decodeURIComponent(productMatch[1]);
    const product = products.get(id);
    if (request.method === "GET") return product ? respond(response, 200, product) : respond(response, 404, { message: "Not found" });
    if (["PUT", "PATCH"].includes(request.method) && product) {
      const updated = { ...product, ...body };
      products.set(id, updated);
      return respond(response, 200, updated);
    }
  }
  if (url.pathname === "/api/v1/admin/categories" && request.method === "GET") return respond(response, 200, []);
  if (url.pathname === "/api/v1/admin/commerce/promo-codes" && request.method === "GET") {
    return respond(response, 200, [...promoCodes.values()]);
  }
  if (url.pathname === "/api/v1/admin/commerce/promo-codes" && request.method === "POST") {
    const item = { id: `fixture-promo-${promoCodes.size + 1}`, ...body, createdAt: now };
    promoCodes.set(item.id, item);
    return respond(response, 201, item);
  }
  if (url.pathname === "/api/v1/admin/orders" && request.method === "GET") {
    return respond(response, 200, []);
  }
  if (url.pathname === "/api/v1/admin/dashboard" && request.method === "GET") {
    return respond(response, 200, {
      products: { published: products.size, pendingReview: 0, rejected: 0 },
      orders: { total: 0 },
      users: { total: 1 },
      finance: { revenue: 0, netProfit: 0, expenses: 0 },
    });
  }
  if (url.pathname === "/api/v1/admin/integration-diagnostics" && request.method === "GET") return respond(response, 200, []);
  if (url.pathname === "/media/upload" && request.method === "POST") {
    return respond(response, 201, {
      id: "fixture-media-1",
      url: "https://media.averon.local/fixture-product.png",
      ownerId: adminUser.id,
      mimeType: "image/png",
      size: body?.rawBodyBytes ?? 68,
      width: 1,
      height: 1,
      hash: "fixture-image-hash",
      createdAt: now,
      updatedAt: now,
      isNewUpload: true,
    });
  }
  if (url.pathname === "/api/v1/capabilities" && request.method === "GET") {
    return respond(response, 200, {
      aiProductFill: false,
      imageEmbeddings: false,
      telegramProductPublish: false,
      telegramProductPublishFeatureEnabled: false,
      telegramProductPublishConfigured: false,
    });
  }
  if (request.method === "GET" && url.pathname.startsWith("/api/")) return respond(response, 200, page([]));
  if (request.method !== "GET" && url.pathname.startsWith("/api/")) return respond(response, 404, { message: "Not found" });
  return respond(response, 404, { message: "Not found" });
});

server.listen(port, host, () => {
  process.stdout.write(`Local admin fixture listening on http://${host}:${port}\n`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
