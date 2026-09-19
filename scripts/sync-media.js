import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const projectsDir = path.join(__dirname, '../src/content/projects');
const workDir = path.join(__dirname, '../public/work');

// Read categories dynamically from categories.json (same as optimize-images.js)
const categoriesData = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../src/content/categories.json'), 'utf-8')
);

function slugify(text) {
  return text.toString().toLowerCase().trim().replace(/[\s\W-]+/g, '-');
}

const categoryMap = {
  'category_1': slugify(categoriesData.category_1_title || 'category-1'),
  'category_2': slugify(categoriesData.category_2_title || 'category-2'),
  'category_3': slugify(categoriesData.category_3_title || 'category-3'),
  'category_4': slugify(categoriesData.category_4_title || 'category-4'),
  // Carpeta estable para los proyectos de la categoría opcional Ikeneas.
  'category_ikeneas': 'ikeneas',
};

console.log('📂 Category mapping:', categoryMap);

// All known category folder names for detection
const allCategoryFolders = new Set(Object.values(categoryMap));

function isExternalUrl(value) {
  return /^https?:\/\//i.test(value);
}

function isVideoPath(value) {
  return /\.(mp4|m4v|webm|ogv|ogg|mov)(?:$|[?#])/i.test(value);
}

function ensureDirSync(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function syncMedia() {
  if (!fs.existsSync(projectsDir)) return;

  const projectFiles = fs.readdirSync(projectsDir).filter(f => f.endsWith('.json'));
  let updatedCount = 0;
  let movedCount = 0;

  for (const file of projectFiles) {
    const projectSlug = file.replace('.json', '');
    const fullPath = path.join(projectsDir, file);
    const content = fs.readFileSync(fullPath, 'utf8');
    let project;
    try {
      project = JSON.parse(content);
    } catch (e) {
      console.error(`  ✗ Error parsing ${file}:`, e.message);
      continue;
    }

    const expectedCatFolder = categoryMap[project.category];
    if (!expectedCatFolder) continue;

    // The correct destination for this project's images
    const expectedDir = path.join(workDir, expectedCatFolder, projectSlug);
    const expectedPrefix = `/work/${expectedCatFolder}/${projectSlug}/`;

    if (!project.images || !Array.isArray(project.images) || project.images.length === 0) continue;

    let needsUpdate = false;
    const newImages = [];

    for (const imgPath of project.images) {
      // Cloudinary URLs and legacy videos must remain untouched. Rewriting an
      // external URL to a local path during prebuild would break the entry.
      if (isExternalUrl(imgPath) || isVideoPath(imgPath)) {
        newImages.push(imgPath);
        continue;
      }

      const filename = path.basename(imgPath);
      const destFile = path.join(expectedDir, filename);
      const newPublicPath = `${expectedPrefix}${filename}`;

      // If already at expected prefix AND the file exists on disk at destFile, we're good
      if (imgPath === newPublicPath && fs.existsSync(destFile)) {
        newImages.push(imgPath);
        continue;
      }

      // Find where the file currently lives on disk
      const possibleSources = [];

      // 1. Check if it's at the path indicated by the JSON in public/
      const fromJson = path.join(workDir, '..', 'public', imgPath.startsWith('/') ? imgPath.substring(1) : imgPath);
      possibleSources.push(fromJson);

      // 2. Check if Sveltia CMS placed it inside src/content/projects/public
      const cmsPublicDir = path.join(projectsDir, 'public');
      if (fs.existsSync(cmsPublicDir)) {
        const fromCmsJson = path.join(cmsPublicDir, imgPath.startsWith('/') ? imgPath.substring(1) : imgPath);
        possibleSources.push(fromCmsJson);

        // Also search recursively in cmsPublicDir for this filename
        const searchCmsDir = (dir) => {
          try {
            for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
              const full = path.join(dir, entry.name);
              if (entry.isDirectory()) {
                searchCmsDir(full);
              } else if (entry.name.toLowerCase() === filename.toLowerCase()) {
                possibleSources.push(full);
              }
            }
          } catch (e) {}
        };
        searchCmsDir(cmsPublicDir);
      }

      // 3. Check flat in global work dir
      possibleSources.push(path.join(workDir, filename));

      // 4. Check flat in expected category dir
      possibleSources.push(path.join(workDir, expectedCatFolder, filename));

      // 5. Check in any other category folder (flat)
      for (const catFolder of allCategoryFolders) {
        possibleSources.push(path.join(workDir, catFolder, filename));
      }

      // 6. Check in any other category/slug subfolder
      for (const catFolder of allCategoryFolders) {
        const catDir = path.join(workDir, catFolder);
        if (fs.existsSync(catDir)) {
          try {
            for (const entry of fs.readdirSync(catDir, { withFileTypes: true })) {
              if (entry.isDirectory()) {
                possibleSources.push(path.join(catDir, entry.name, filename));
              }
            }
          } catch (e) { /* ignore */ }
        }
      }

      // Find the first source that actually exists
      let sourceFile = null;
      for (const src of possibleSources) {
        if (fs.existsSync(src)) {
          sourceFile = src;
          break;
        }
      }

      if (sourceFile) {
        // Only move if source != destination
        if (path.resolve(sourceFile) !== path.resolve(destFile)) {
          ensureDirSync(expectedDir);
          try {
            fs.renameSync(sourceFile, destFile);
            movedCount++;
            console.log(`  → Moved: ${path.relative(process.cwd(), sourceFile)} → ${path.relative(process.cwd(), destFile)}`);
          } catch (err) {
            // If rename fails (cross-device), try copy+delete
            try {
              fs.copyFileSync(sourceFile, destFile);
              fs.unlinkSync(sourceFile);
              movedCount++;
              console.log(`  → Moved (copy): ${path.relative(process.cwd(), sourceFile)} → ${path.relative(process.cwd(), destFile)}`);
            } catch (copyErr) {
              console.error(`  ✗ Failed to move ${sourceFile}:`, copyErr.message);
              newImages.push(imgPath); // Keep old path
              continue;
            }
          }
        }
      } else {
        console.warn(`  ⚠ File not found for ${imgPath} (project: ${projectSlug})`);
      }

      newImages.push(newPublicPath);
      if (imgPath !== newPublicPath) {
        needsUpdate = true;
      }
    }

    if (needsUpdate) {
      project.images = newImages;
      fs.writeFileSync(fullPath, JSON.stringify(project, null, 2) + '\n', 'utf8');
      updatedCount++;
      console.log(`  ✓ Updated JSON: ${file}`);
    }
  }

  // Clean up empty directories in work folder
  for (const catFolder of allCategoryFolders) {
    const catDir = path.join(workDir, catFolder);
    if (!fs.existsSync(catDir)) continue;
    try {
      for (const entry of fs.readdirSync(catDir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          const subDir = path.join(catDir, entry.name);
          const files = fs.readdirSync(subDir);
          if (files.length === 0) {
            fs.rmdirSync(subDir);
            console.log(`  🗑 Removed empty dir: ${catFolder}/${entry.name}`);
          }
        }
      }
    } catch (e) { /* ignore */ }
  }

  // Clean up src/content/projects/public if empty or if misplaced files were moved
  const cmsPublicDir = path.join(projectsDir, 'public');
  if (fs.existsSync(cmsPublicDir)) {
    try {
      fs.rmSync(cmsPublicDir, { recursive: true, force: true });
      console.log(`  🗑 Cleaned up CMS misplaced folder: src/content/projects/public`);
    } catch (e) { /* ignore */ }
  }

  console.log(`\n✅ Media sync complete. Updated ${updatedCount} project files, moved ${movedCount} files.`);
}

syncMedia();
