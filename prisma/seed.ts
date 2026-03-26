import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding database...");

  // ── Plans ──────────────────────────────────────────
  const plans = [
    {
      key: "starter",
      name: "Starter",
      priceCents: BigInt(2900),
      features: {
        projects: 3,
        generations: 100,
        members: 2,
        storage_gb: 1,
      },
    },
    {
      key: "growth",
      name: "Growth",
      priceCents: BigInt(7900),
      features: {
        projects: 15,
        generations: 1000,
        members: 10,
        storage_gb: 10,
      },
    },
    {
      key: "agency",
      name: "Agency",
      priceCents: BigInt(19900),
      features: {
        projects: -1, // unlimited
        generations: 10000,
        members: 50,
        storage_gb: 100,
      },
    },
  ];

  for (const plan of plans) {
    await prisma.plan.upsert({
      where: { key: plan.key },
      update: { name: plan.name, priceCents: plan.priceCents, features: plan.features },
      create: plan,
    });
  }
  console.log(`  ✓ ${plans.length} plans`);

  // ── Model Catalog ──────────────────────────────────
  const models = [
    { provider: "openai", modelName: "gpt-4o", capabilities: ["text", "code", "chat"], costMetrics: { input_per_1k: 2.5, output_per_1k: 10.0 } },
    { provider: "openai", modelName: "gpt-4o-mini", capabilities: ["text", "code", "chat"], costMetrics: { input_per_1k: 0.15, output_per_1k: 0.6 } },
    { provider: "openai", modelName: "dall-e-3", capabilities: ["image"], costMetrics: { per_image: 40.0 } },
    { provider: "anthropic", modelName: "claude-sonnet-4-20250514", capabilities: ["text", "code", "chat"], costMetrics: { input_per_1k: 3.0, output_per_1k: 15.0 } },
    { provider: "anthropic", modelName: "claude-3-haiku", capabilities: ["text", "code", "chat"], costMetrics: { input_per_1k: 0.25, output_per_1k: 1.25 } },
    { provider: "stability", modelName: "sdxl-1.0", capabilities: ["image"], costMetrics: { per_image: 2.0 } },
    { provider: "cohere", modelName: "embed-v3", capabilities: ["embeddings"], costMetrics: { per_1k_tokens: 0.1 } },
  ];

  for (const m of models) {
    await prisma.modelCatalog.upsert({
      where: { provider_modelName: { provider: m.provider, modelName: m.modelName } },
      update: { capabilities: m.capabilities, costMetrics: m.costMetrics },
      create: m,
    });
  }
  console.log(`  ✓ ${models.length} model catalog entries`);

  console.log("✅ Seed complete");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
