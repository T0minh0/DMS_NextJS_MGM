import sanitizeHtml, { IOptions } from 'sanitize-html';

export const NOTICE_CONTENT_ALLOWED_TAGS = [
  'p',
  'br',
  'strong',
  'em',
  'b',
  'i',
  'u',
  'ul',
  'ol',
  'li',
  'blockquote',
] as const;

const titleOptions: IOptions = {
  allowedTags: [],
  allowedAttributes: {},
  nonTextTags: ['script', 'style', 'textarea', 'option'],
};

const contentOptions: IOptions = {
  allowedTags: [...NOTICE_CONTENT_ALLOWED_TAGS],
  allowedAttributes: {},
  nonTextTags: ['script', 'style', 'textarea', 'option'],
};

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

export function sanitizeNoticeTitle(value: string) {
  return normalizeWhitespace(sanitizeHtml(value, titleOptions)).slice(0, 200);
}

export function sanitizeNoticeContent(value: string) {
  return sanitizeHtml(value, contentOptions).trim();
}
