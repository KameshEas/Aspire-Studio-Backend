/**
 * UI Generation Activities
 * Handles layout synthesis, component spec generation, thumbnails, and Figma export
 */

import { groq } from '../../lib/providers/groq';
import type { ActivityResult } from '../../lib/workflow/activities';

export interface LayoutSpec {
  sections: Array<{
    name: string;
    type: 'hero' | 'features' | 'pricing' | 'testimonials' | 'cta' | 'footer';
    gridCols: number;
    height: number;
    backgroundColor?: string;
    components: string[];
  }>;
  colors: {
    primary: string;
    secondary: string;
    background: string;
    text: string;
  };
  typography: {
    heading: string;
    body: string;
  };
}

export interface ComponentSpec {
  name: string;
  type: string;
  props: Record<string, any>;
  children?: ComponentSpec[];
  styling?: Record<string, string>;
}

export interface UIGenerationOutput {
  layoutSpec: LayoutSpec;
  components: ComponentSpec[];
  figmaUrl?: string;
  mockImageBase64?: string;
}

/**
 * Synthesize layout specification from brand and content
 * LLM-powered layout design based on brand identity and target audience
 */
export async function synthesizeLayoutActivity(options: {
  brandName: string;
  brandTone: string;
  targetAudience: string;
  siteType: 'landing' | 'saas' | 'blog' | 'portfolio' | 'ecommerce';
  includeNavigation?: boolean;
}): Promise<ActivityResult<LayoutSpec>> {
  try {
    const prompt = `
Generate a landing page layout specification in JSON format for the following:
- Brand: ${options.brandName}
- Tone: ${options.brandTone}
- Target Audience: ${options.targetAudience}
- Type: ${options.siteType}

The specification should include:
1. Sections array with section names, types (hero, features, pricing, testimonials, cta, footer), grid layouts, heights, and component names
2. Color palette with primary, secondary, background, and text colors
3. Typography choices for headings and body

Return ONLY valid JSON, no markdown or explanations.

Example structure:
{
  "sections": [
    {"name": "header", "type": "hero", "gridCols": 2, "height": 400, "components": ["headline", "cta_button"]},
    {"name": "features", "type": "features", "gridCols": 3, "height": 300, "components": ["feature_card", "feature_card", "feature_card"]}
  ],
  "colors": {"primary": "#007bff", "secondary": "#6c757d", "background": "#ffffff", "text": "#333333"},
  "typography": {"heading": "Inter, sans-serif", "body": "Inter, sans-serif"}
}`;

    const response = await groq.generateText({
      prompt,
      model: 'mixtral-8x7b-32768',
      maxTokens: 2000,
      temperature: 0.7,
    });

    // Parse the generated JSON
    const layoutSpec: LayoutSpec = JSON.parse(response.text);

    return {
      success: true,
      data: layoutSpec,
      duration: 0,
    };
  } catch (error) {
    console.error('[synthesizeLayoutActivity] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      duration: 0,
    };
  }
}

/**
 * Generate React component specifications from layout
 * Creates detailed component structure with props and styling
 */
export async function generateComponentSpecActivity(options: {
  layoutSpec: LayoutSpec;
  includeAnimations?: boolean;
  includeAccessibility?: boolean;
}): Promise<ActivityResult<ComponentSpec[]>> {
  try {
    const layoutJson = JSON.stringify(options.layoutSpec, null, 2);

    const prompt = `
Generate React component specifications for the following layout:

${layoutJson}

For each section, create detailed component specifications including:
1. Component name (PascalCase)
2. Component type (functional component)
3. Props (inputs the component accepts)
4. Styling (Tailwind classes)
5. Children components if applicable

${options.includeAnimations ? '5. Include animation props (framer-motion compatible)' : ''}
${options.includeAccessibility ? '6. Include ARIA attributes for accessibility' : ''}

Return ONLY valid JSON array of component specs, no markdown.

Example component:
{
  "name": "HeroSection",
  "type": "section",
  "props": {"title": "string", "subtitle": "string", "buttonText": "string", "onCTAClick": "function"},
  "styling": {"container": "flex flex-col items-center justify-center min-h-screen bg-gradient-to-r from-blue-500 to-blue-600", "heading": "text-5xl font-bold text-white"}
}`;

    const response = await groq.generateText({
      prompt,
      model: 'mixtral-8x7b-32768',
      maxTokens: 3000,
      temperature: 0.7,
    });

    const components: ComponentSpec[] = JSON.parse(response.text);

    return {
      success: true,
      data: components,
      duration: 0,
    };
  } catch (error) {
    console.error('[generateComponentSpecActivity] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      duration: 0,
    };
  }
}

/**
 * Generate thumbnail/mockup image for UI design
 * Creates a visual preview of the generated layout
 */
export async function generateUIThumbnailActivity(options: {
  layoutSpec: LayoutSpec;
  width?: number;
  height?: number;
}): Promise<ActivityResult<{ imageBase64: string; mimeType: string }>> {
  try {
    const width = options.width || 1024;
    const height = options.height || 768;
    const colors = options.layoutSpec.colors;

    // Generate SVG mockup of the layout
    let sections = '';
    let yPosition = 0;
    const sectionHeight = height / (options.layoutSpec.sections.length || 1);

    for (const section of options.layoutSpec.sections) {
      const sectionY = yPosition;
      const sectionH = sectionHeight;

      sections += `
<rect x="0" y="${sectionY}" width="${width}" height="${sectionH}" 
      fill="${section.backgroundColor || colors.background}" stroke="${colors.primary}" stroke-width="2"/>
<text x="20" y="${sectionY + 30}" font-size="16" font-weight="bold" fill="${colors.text}">
  ${section.type}
</text>`;

      yPosition += sectionH;
    }

    const svg = `
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <style>
      text { font-family: Arial, sans-serif; }
    </style>
  </defs>
  <rect width="${width}" height="${height}" fill="${colors.background}"/>
  ${sections}
  <text x="${width / 2}" y="${height - 20}" font-size="12" text-anchor="middle" fill="#999999">
    UI Layout Preview
  </text>
</svg>`.trim();

    const base64 = Buffer.from(svg).toString('base64');

    return {
      success: true,
      data: {
        imageBase64: base64,
        mimeType: 'image/svg+xml',
      },
      duration: 0,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      duration: 0,
    };
  }
}

/**
 * Export UI specification to Figma (stub for Phase 2)
 * In production, this would call Figma API to create design file
 */
export async function exportToFigmaActivity(options: {
  layoutSpec: LayoutSpec;
  components: ComponentSpec[];
  figmaToken?: string;
  projectId: string;
}): Promise<ActivityResult<{ figmaFileId: string; figmaUrl: string }>> {
  try {
    // Phase 2: Implement Figma API integration
    // For now, return mock success with placeholder URL
    const mockFileId = `figma-${Date.now()}`;
    const mockUrl = `https://www.figma.com/file/${mockFileId}/generated-ui`;

    return {
      success: true,
      data: {
        figmaFileId: mockFileId,
        figmaUrl: mockUrl,
      },
      duration: 0,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      duration: 0,
    };
  }
}

/**
 * Generate HTML preview from component specs
 * Creates a standalone HTML file that previews the design
 */
export async function generateHTMLPreviewActivity(options: {
  layoutSpec: LayoutSpec;
  components: ComponentSpec[];
}): Promise<ActivityResult<{ html: string; mimeType: string }>> {
  try {
    const colors = options.layoutSpec.colors;
    const typography = options.layoutSpec.typography;

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Generated Landing Page</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      font-family: ${typography.body}; 
      color: ${colors.text}; 
      background: ${colors.background};
    }
    h1, h2, h3 { font-family: ${typography.heading}; color: ${colors.primary}; }
    .container { max-width: 1200px; margin: 0 auto; padding: 40px 20px; }
    .section { padding: 60px 20px; border-bottom: 1px solid #eee; }
    .section-title { font-size: 2em; margin-bottom: 20px; }
    .cta-button { 
      background: ${colors.primary}; 
      color: white; 
      padding: 12px 24px; 
      border: none; 
      border-radius: 4px; 
      cursor: pointer;
      font-size: 16px;
    }
    .cta-button:hover { opacity: 0.9; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; }
    .card { 
      background: white; 
      padding: 20px; 
      border-radius: 8px; 
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
  </style>
</head>
<body>
  ${options.layoutSpec.sections
    .map(
      (section) => `
  <div class="section" style="background: ${section.backgroundColor || 'transparent'}">
    <div class="container">
      <h2 class="section-title">${section.name}</h2>
      <p>Section: ${section.type}</p>
    </div>
  </div>
  `
    )
    .join('')}
  
  <div class="section">
    <div class="container">
      <p style="text-align: center; color: #999; font-size: 12px;">
        Generated by Aspire Studio - ${new Date().toISOString()}
      </p>
    </div>
  </div>
</body>
</html>`;

    return {
      success: true,
      data: {
        html,
        mimeType: 'text/html',
      },
      duration: 0,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      duration: 0,
    };
  }
}
