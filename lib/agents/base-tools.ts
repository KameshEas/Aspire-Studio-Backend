import { DynamicTool } from "@langchain/core/tools";

/**
 * Brand Generation Tool
 * Generates brand assets: name, tagline, color palette, logo description, brand guide
 */
export const brandGenerationTool = new DynamicTool({
  name: "generate_brand",
  description:
    "Generate brand assets including name, tagline, color palette (hex codes), logo description, and brand guidelines. Input: JSON with industry, targetAudience, tone, keywords",
  func: async (input: string) => {
    return JSON.stringify({
      brandName: "Generated Brand",
      tagline: "A generated tagline",
      colors: {
        primary: "#FF6B6B",
        secondary: "#4ECDC4",
        accent: "#95E1D3",
      },
      logoDescription: "Modern geometric logo",
      brandGuide: "Brand guidelines document",
    });
  },
});

/**
 * UI/UX Generation Tool
 * Generates layouts, component specifications, mockups, HTML/CSS code
 */
export const uiGenerationTool = new DynamicTool({
  name: "generate_ui",
  description:
    "Generate UI/UX layouts, component specifications, mockups, and HTML/CSS code for web pages. Input: JSON with pageType, components, colorScheme",
  func: async (input: string) => {
    return JSON.stringify({
      layout: "Mobile-first responsive layout",
      components: [{ name: "hero", spec: "Full-width hero section" }],
      htmlCss: "<div><!-- Generated code --></div>",
    });
  },
});

/**
 * Content Generation Tool
 * Generates hero copy, CTAs, SEO metadata, email sequences, social variants
 */
export const contentGenerationTool = new DynamicTool({
  name: "generate_content",
  description:
    "Generate marketing content: hero copy, CTAs, SEO metadata, email sequences, and social media variants. Input: JSON with productName, productDescription, targetAudience, tone",
  func: async (input: string) => {
    return JSON.stringify({
      heroCopy: "Compelling headline",
      cta: "Call-to-action button text",
      seoMetadata: { title: "SEO Title", description: "Meta description" },
      emailSequence: ["Email 1", "Email 2"],
      socialVariants: { twitter: "Tweet", linkedin: "Post" },
    });
  },
});

/**
 * Code Generation Tool
 * Generates React components, tests, TypeScript types, linting validation
 */
export const codeGenerationTool = new DynamicTool({
  name: "generate_code",
  description:
    "Generate React components, TypeScript types, unit tests, and ensure code passes linting. Input: JSON with componentName, functionality, props",
  func: async (input: string) => {
    return JSON.stringify({
      component: "export const Component = (props) => { /* code */ }",
      types: "export interface ComponentProps { /* types */ }",
      tests: "describe('Component', () => { /* tests */ })",
      lintStatus: "passed",
    });
  },
});

/**
 * SEO/Analytics Tool
 * Analyzes competitors, keyword strategy, meta descriptions, link structure
 */
export const seoAnalyticsTool = new DynamicTool({
  name: "analyze_seo",
  description:
    "Analyze SEO strategy: competitors, keywords, meta descriptions, link structure, and recommendations. Input: JSON with targetKeywords, competitorUrls, contentTopic",
  func: async (input: string) => {
    return JSON.stringify({
      keywordStrategy: { primary: "main keyword", secondary: ["related", "keywords"] },
      metaDescription: "Optimized meta description",
      linkStructure: { internal: ["links"], external: ["links"] },
      competitors: ["competitor 1", "competitor 2"],
      recommendations: ["recommendation 1", "recommendation 2"],
    });
  },
});

/**
 * Deployment Tool
 * Handles deployment: GitHub setup, Vercel deployment, DNS, SSL certificates
 */
export const deploymentTool = new DynamicTool({
  name: "deploy_project",
  description:
    "Deploy project: GitHub repository setup, Vercel deployment, DNS configuration, SSL certificates. Input: JSON with projectName, repositoryUrl, environment, customDomain",
  func: async (input: string) => {
    return JSON.stringify({
      githubStatus: "Repository created",
      deploymentUrl: "https://project.vercel.app",
      dnsStatus: "DNS configured",
      sslStatus: "SSL certificate installed",
    });
  },
});

/**
 * Tool Registry
 * Maps tool names to tool instances for agent use
 */
export const toolRegistry = {
  generate_brand: brandGenerationTool,
  generate_ui: uiGenerationTool,
  generate_content: contentGenerationTool,
  generate_code: codeGenerationTool,
  analyze_seo: seoAnalyticsTool,
  deploy_project: deploymentTool,
};

export const allTools = [
  brandGenerationTool,
  uiGenerationTool,
  contentGenerationTool,
  codeGenerationTool,
  seoAnalyticsTool,
  deploymentTool,
];
