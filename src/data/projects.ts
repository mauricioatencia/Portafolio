export interface ProjectSection {
	label: string;
	/** Texto del cuerpo. Separa párrafos con una línea en blanco (\n\n). */
	paragraphs: string;
}

export interface Project {
	id: string;
	/** Ancla del slide de detalle. Debe ser único en todas las categorías. */
	slug: string;
	name: string;
	year?: string;
	date?: string;
	location: string;
	color: string;
	/** Frase corta bajo el título. Usa \n para forzar el salto de línea. */
	tagline?: string;
	services?: string[];
	/** Controla si se muestra el CTA de WhatsApp en la galería del proyecto. */
	show_quote_button?: boolean;
	sections?: ProjectSection[];
	/** Nota legal al pie de la página */
	note?: string;
	/**
	 * Pantallas de imagen a pantalla completa, después de la descripción.
	 * Cada ruta es una pantalla distinta (ej. `/work/branding/pitao/2.jpg`).
	 */
	images?: string[];
	/**
	 * Imagen específica para Open Graph (redes sociales).
	 * Si no se provee, se usará la primera de `images`.
	 */
	ogImage?: string;
	category?: string;
}

export interface ProjectCategory {
	title: string;
	slug: string;
	hoverColor: string;
	projects: Project[];
}

import categoriesData from '../content/categories.json';

const allProjectFiles = import.meta.glob('../content/projects/*.json', { eager: true });

function mapProjects(files: Record<string, any>): Project[] {
	const projects = Object.entries(files).map(([path, data]) => {
		const slug = path.split('/').pop()?.replace('.json', '') || '';
		const project = { ...(data as any).default || data, slug } as Project;
		if (project.date && !project.year) {
			project.year = project.date.substring(0, 4);
		}
		return project;
	});
	projects.sort((a, b) => {
		const dateA = a.date ? new Date(a.date).getTime() : (a.year ? new Date(`${a.year}-01-01`).getTime() : 0);
		const dateB = b.date ? new Date(b.date).getTime() : (b.year ? new Date(`${b.year}-01-01`).getTime() : 0);
		if (dateA !== dateB) {
			return dateB - dateA; // Descendente por fecha/año
		}
		// Si es igual, un orden estable por nombre/slug (evita depender de un ID manual)
		const nameA = (a.name || '').toString().toLowerCase();
		const nameB = (b.name || '').toString().toLowerCase();
		if (nameA !== nameB) return nameA.localeCompare(nameB);
		return (a.slug || '').localeCompare(b.slug || '');
	});

	return projects;
}

const allProjectsRaw = mapProjects(allProjectFiles);

const category1Projects = allProjectsRaw.filter(p => p.category === 'category_1').map((project, index) => ({
	...project,
	id: String(index + 1).padStart(2, '0')
}));
const category2Projects = allProjectsRaw.filter(p => p.category === 'category_2').map((project, index) => ({
	...project,
	id: String(index + 1).padStart(2, '0')
}));
const category3Projects = allProjectsRaw.filter(p => p.category === 'category_3').map((project, index) => ({
	...project,
	id: String(index + 1).padStart(2, '0')
}));
const category4Projects = allProjectsRaw.filter(p => p.category === 'category_4').map((project, index) => ({
	...project,
	id: String(index + 1).padStart(2, '0')
}));

const allProjects = [...category1Projects, ...category2Projects, ...category3Projects, ...category4Projects];

function slugify(text: string) {
	return text.toString().toLowerCase().trim().replace(/[\s\W-]+/g, '-');
}

export const projectCategories: Record<string, ProjectCategory> = {
	category_1: {
		title: categoriesData.category_1_title || 'CATEGORÍA 1',
		slug: slugify(categoriesData.category_1_title || 'CATEGORÍA 1'),
		hoverColor: categoriesData.category_1_hover_color || '#e26000',
		projects: category1Projects
	},
	category_2: {
		title: categoriesData.category_2_title || 'CATEGORÍA 2',
		slug: slugify(categoriesData.category_2_title || 'CATEGORÍA 2'),
		hoverColor: categoriesData.category_2_hover_color || '#d70016',
		projects: category2Projects
	},
	category_3: {
		title: categoriesData.category_3_title || 'CATEGORÍA 3',
		slug: slugify(categoriesData.category_3_title || 'CATEGORÍA 3'),
		hoverColor: categoriesData.category_3_hover_color || '#b2cdb6',
		projects: category3Projects
	},
	category_4: {
		title: categoriesData.category_4_title || 'CATEGORÍA 4',
		slug: slugify(categoriesData.category_4_title || 'CATEGORÍA 4'),
		hoverColor: categoriesData.category_4_hover_color || '#ab9900',
		projects: category4Projects
	}
};

export function getCategory(category: string): ProjectCategory | undefined {
	return projectCategories[category];
}

/** Hash del proyecto dentro de la profundidad de Work */
export function projectHref(project: Project): string {
	return `#${project.slug}`;
}

/** Categoría que contiene un proyecto, si existe */
export function findProjectCategory(slug: string): string | undefined {
	for (const [id, group] of Object.entries(projectCategories)) {
		if (group.projects.some((project) => project.slug === slug)) return id;
	}
	return undefined;
}

/**
 * Siguientes proyectos en el orden de la categoría del slug actual.
 * Avanza circularmente y excluye el proyecto actual.
 */
export function getNextProjects(slug: string, count = 3): Project[] {
	for (const group of Object.values(projectCategories)) {
		const index = group.projects.findIndex((project) => project.slug === slug);
		if (index === -1) continue;

		const pool = group.projects;
		if (pool.length <= 1) return [];

		const result: Project[] = [];
		for (let step = 1; step < pool.length && result.length < count; step += 1) {
			result.push(pool[(index + step) % pool.length]);
		}
		return result;
	}
	return [];
}

/** Proyecto anterior y siguiente dentro de la misma categoría (circular). */
export function getAdjacentProjects(slug: string): { prev: Project | null; next: Project | null } {
	for (const group of Object.values(projectCategories)) {
		const index = group.projects.findIndex((p) => p.slug === slug);
		if (index === -1) continue;

		const pool = group.projects;
		if (pool.length <= 1) return { prev: null, next: null };

		const prev = pool[(index - 1 + pool.length) % pool.length];
		const next = pool[(index + 1) % pool.length];
		return { prev, next };
	}
	return { prev: null, next: null };
}
