/**
 * Minimal HTML-to-text extraction for `web_fetch`: readable text with links and headings,
 * without pulling an HTML parser dependency into the agent.
 */

/** Tags whose contents are never readable content. */
const DROP_BLOCKS = /<(script|style|noscript|svg|iframe|template|head|select|button)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;

/** Closing tags that end a text block. */
const BLOCK_END =
	/<\/(?:p|div|section|article|header|footer|aside|main|nav|figure|figcaption|blockquote|pre|table|tr|ul|ol|dl|dd|dt|form|fieldset|address|details|summary|h[1-6])\s*>/gi;

const ENTITIES: Record<string, string> = {
	amp: "&",
	lt: "<",
	gt: ">",
	quot: '"',
	apos: "'",
	nbsp: " ",
	mdash: "—",
	ndash: "–",
	hellip: "…",
	laquo: "«",
	raquo: "»",
};

function decodeEntities(text: string): string {
	return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity: string) => {
		if (entity.startsWith("#x") || entity.startsWith("#X")) {
			const code = Number.parseInt(entity.slice(2), 16);
			return Number.isFinite(code) ? String.fromCodePoint(code) : match;
		}
		if (entity.startsWith("#")) {
			const code = Number.parseInt(entity.slice(1), 10);
			return Number.isFinite(code) ? String.fromCodePoint(code) : match;
		}
		return ENTITIES[entity.toLowerCase()] ?? match;
	});
}

function stripTags(html: string): string {
	return html.replace(/<[^>]+>/g, " ");
}

/**
 * Convert an HTML document to readable plain text. Keeps the document title, heading levels as `#`
 * prefixes, list items as `- ` lines, and links as `[text](url)`.
 */
export function htmlToText(html: string): string {
	const title = /<title[^>]*>([\s\S]*?)<\/title\s*>/i.exec(html)?.[1];

	let text = html
		.replace(DROP_BLOCKS, " ")
		.replace(/<!--[\s\S]*?-->/g, " ")
		.replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, " ")
		.replace(/<!doctype[^>]*>/gi, " ");

	// Anchors become [text](href); anchor text keeps its own tag stripping.
	text = text.replace(
		/<a\b[^>]*?\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>([\s\S]*?)<\/a\s*>/gi,
		(
			_match,
			doubleQuoted: string | undefined,
			singleQuoted: string | undefined,
			bare: string | undefined,
			inner: string,
		) => {
			const href = (doubleQuoted ?? singleQuoted ?? bare ?? "").trim();
			const label = stripTags(inner).replace(/\s+/g, " ").trim();
			if (!label) return href ? ` ${href} ` : " ";
			if (!href || href.startsWith("#") || href.toLowerCase().startsWith("javascript:")) return ` ${label} `;
			return ` [${label}](${href}) `;
		},
	);

	// Heading levels as markdown prefixes.
	text = text.replace(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1\s*>/gi, (_match, level: string, inner: string) => {
		const label = stripTags(inner).replace(/\s+/g, " ").trim();
		return label ? `\n\n${"#".repeat(Number(level))} ${label}\n\n` : "\n";
	});

	// List items and line-level structure.
	text = text
		.replace(/<li\b[^>]*>/gi, "\n- ")
		.replace(/<br\b[^>]*>/gi, "\n")
		.replace(/<hr\b[^>]*>/gi, "\n\n")
		.replace(/<td\b[^>]*>/gi, " | ")
		.replace(BLOCK_END, "\n");

	// Everything else: drop the tag, keep the text.
	text = stripTags(text);
	text = decodeEntities(text);

	if (title) {
		const cleanTitle = decodeEntities(title.replace(/\s+/g, " ").trim());
		if (cleanTitle) text = `# ${cleanTitle}\n\n${text}`;
	}

	return text
		.split("\n")
		.map((line) => line.replace(/[ \t]+/g, " ").trim())
		.join("\n")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}
