/**
 * optimize-images.js
 *
 * Comprime y organiza las imágenes de cada proyecto en:
 *   public/work/{category-slug}/{project-slug}/{nombre-original}.webp
 *
 * - Lee todos los .json de src/content/projects/
 * - Lee la categoría del proyecto y la mapea a su slug
 * - Genera versiones WebP comprimidas organizadas por categoría y proyecto
 * - Actualiza los paths en los archivos JSON
 * - Elimina las imágenes originales (PNG o WebP sin categoría) si ya fueron migradas
 *
 * Uso: node scripts/optimize-images.js
 * En build: se ejecuta automáticamente via "prebuild" en package.json
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const projectsDir = path.resolve(__dirname, '../src/content/projects');
const publicDir = path.resolve(__dirname, '../public');
const workDir = path.resolve(publicDir, 'work');

// Configuración de compresión
const WEBP_QUALITY = 82;  // Prácticamente indistinguible del original en pantalla
const MAX_WIDTH = 2400;   // Suficiente para pantallas 4K
const MAX_HEIGHT = 2400;

function isOptimizableRasterImage(value) {
  return /\.(avif|jpe?g|png|tiff?|webp)(?:$|[?#])/i.test(value);
}

// Leer categorías y generar slugs (misma lógica que projects.ts)
const categoriesData = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../src/content/categories.json'), 'utf-8')
);

function slugify(text) {
  return text.toString().toLowerCase().trim().replace(/[\s\W-]+/g, '-');
}

const categorySlugMap = {
  category_1: slugify(categoriesData.category_1_title || 'category-1'),
  category_2: slugify(categoriesData.category_2_title || 'category-2'),
  category_3: slugify(categoriesData.category_3_title || 'category-3'),
  category_4: slugify(categoriesData.category_4_title || 'category-4'),
  // Debe coincidir con la carpeta configurada para la colección Ikeneas.
  category_ikeneas: 'ikeneas',
};

// Resultado: { category_1: 'branding', category_2: 'art-direction', ... }
console.log('📂 Category mapping:', categorySlugMap);

async function optimizeImages() {
  const files = fs.readdirSync(projectsDir).filter(f => f.endsWith('.json'));

  const originalsToDelete = new Set();
  let totalGenerated = 0;
  let totalSkipped = 0;

  for (const file of files) {
    const filePath = path.join(projectsDir, file);
    let content, project;

    try {
      content = fs.readFileSync(filePath, 'utf-8');
      project = JSON.parse(content);
    } catch (err) {
      console.error(`[Error] Parsing ${file}:`, err.message);
      continue;
    }

    if (!project.images || project.images.length === 0) {
      console.log(`[Skip] ${file} — no images`);
      continue;
    }

    const projectSlug = path.basename(file, '.json');
    const categoryId = project.category || 'category_1';
    const categorySlug = categorySlugMap[categoryId] || categoryId;

    // Estructura destino: public/work/{category}/{project}/
    const projectFolder = path.join(workDir, categorySlug, projectSlug);
    if (!fs.existsSync(projectFolder)) {
      fs.mkdirSync(projectFolder, { recursive: true });
    }

    console.log(`\n📁 [${categorySlug}] ${file}`);

    const newImages = [];
    let jsonModified = false;

    for (const imagePath of project.images) {
      const cleanPath = imagePath.split('?')[0].split('#')[0];

      // Sharp only handles local raster images. Videos are delivered through
      // Cloudinary and external media must never be rewritten during build.
      if (!isOptimizableRasterImage(cleanPath) || /^https?:\/\//i.test(cleanPath)) {
        newImages.push(imagePath);
        totalSkipped++;
        continue;
      }

      const absoluteSrc = path.join(publicDir, cleanPath);

      const finalPath = `/work/${categorySlug}/${projectSlug}/`;
      const originalBasename = path.basename(cleanPath, path.extname(cleanPath));
      const outputFilename = `${originalBasename}.webp`;
      const outputPath = path.join(projectFolder, outputFilename);
      const newPublicPath = `/work/${categorySlug}/${projectSlug}/${outputFilename}`;

      // Already a WebP in the correct final path → skip entirely
      if (cleanPath === newPublicPath && fs.existsSync(outputPath)) {
        newImages.push(imagePath);
        totalSkipped++;
        continue;
      }

      // Image is in the correct folder but NOT WebP (e.g. .png) → convert in-place
      if (cleanPath.startsWith(finalPath) && path.extname(cleanPath).toLowerCase() !== '.webp') {
        if (fs.existsSync(absoluteSrc)) {
          if (!fs.existsSync(outputPath)) {
            try {
              await sharp(absoluteSrc)
                .resize(MAX_WIDTH, MAX_HEIGHT, { fit: 'inside', withoutEnlargement: true })
                .webp({ quality: WEBP_QUALITY, effort: 4 })
                .toFile(outputPath);

              const originalSize = fs.statSync(absoluteSrc).size;
              const newSize = fs.statSync(outputPath).size;
              const reduction = Math.round((1 - newSize / originalSize) * 100);
              console.log(`  ✓ [in-place] ${path.basename(cleanPath)} → ${outputFilename} (-${reduction}%)`);
              totalGenerated++;
            } catch (err) {
              console.error(`  ✗ Error converting in-place: ${cleanPath}: ${err.message}`);
              newImages.push(imagePath);
              continue;
            }
          } else {
            console.log(`  → Already exists: ${outputFilename} (skipping)`);
            totalSkipped++;
          }
          // Delete the non-WebP original
          originalsToDelete.add(absoluteSrc);
          newImages.push(newPublicPath);
          jsonModified = true;
          continue;
        }
      }

      if (!fs.existsSync(absoluteSrc)) {
        console.warn(`  ⚠ Source not found: ${cleanPath}`);
        newImages.push(imagePath);
        continue;
      }

      if (!fs.existsSync(outputPath)) {
        try {
          await sharp(absoluteSrc)
            .resize(MAX_WIDTH, MAX_HEIGHT, {
              fit: 'inside',
              withoutEnlargement: true
            })
            .webp({ quality: WEBP_QUALITY, effort: 4 })
            .toFile(outputPath);

          const originalSize = fs.statSync(absoluteSrc).size;
          const newSize = fs.statSync(outputPath).size;
          const reduction = Math.round((1 - newSize / originalSize) * 100);
          console.log(`  ✓ ${path.basename(cleanPath)} → ${categorySlug}/${projectSlug}/${outputFilename} (-${reduction}%)`);
          totalGenerated++;
          jsonModified = true;
        } catch (err) {
          console.error(`  ✗ Error: ${cleanPath}: ${err.message}`);
          newImages.push(imagePath);
          continue;
        }
      } else {
        // WebP ya existe en destino, marcar original para borrar igual
        console.log(`  → Already exists: ${outputFilename} (skipping compression)`);
        totalSkipped++;
        jsonModified = true;
      }

      originalsToDelete.add(absoluteSrc);
      newImages.push(newPublicPath);
    }

    // Actualizar el JSON con las nuevas rutas
    if (jsonModified) {
      project.images = newImages;
      const updatedContent = JSON.stringify(project, null, 2) + '\n';
      fs.writeFileSync(filePath, updatedContent, 'utf-8');
      console.log(`  ✏  JSON updated`);
    }
  }

  // Eliminar originales migrados
  if (originalsToDelete.size > 0) {
    console.log(`\n🗑  Deleting ${originalsToDelete.size} original files...`);
    for (const originalPath of originalsToDelete) {
      try {
        fs.unlinkSync(originalPath);
      } catch (err) {
        console.warn(`  ⚠ Could not delete ${path.basename(originalPath)}: ${err.message}`);
      }
    }

    // Limpiar carpetas vacías en public/work/ (carpetas de proyecto sin categoría)
    const entries = fs.readdirSync(workDir);
    for (const entry of entries) {
      const entryPath = path.join(workDir, entry);
      if (!fs.statSync(entryPath).isDirectory()) continue;
      // Si no es una de nuestras carpetas de categoría, verificar si está vacía
      const knownCategories = Object.values(categorySlugMap);
      if (!knownCategories.includes(entry)) {
        try {
          const children = fs.readdirSync(entryPath);
          if (children.length === 0) {
            fs.rmdirSync(entryPath);
            console.log(`  🧹 Removed empty folder: work/${entry}`);
          }
        } catch (err) { /* ignorar */ }
      }
    }
  }

  console.log(`\n✅ Done! Generated: ${totalGenerated} | Skipped: ${totalSkipped} | Cleaned originals: ${originalsToDelete.size}`);
}

console.log('🖼  Optimizing and organizing project images...\n');
optimizeImages().catch(console.error);
