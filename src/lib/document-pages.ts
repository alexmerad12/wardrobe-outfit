// Pages people open straight from outside the app: the Play listing's
// account-deletion link, Google's sign-in review, a search result. They
// are documents, so the launch splash never plays over them. A string (not
// a RegExp) because layout.tsx also writes it into the pre-paint script.
export const DOCUMENT_PAGE_PATTERN = "^/(privacy|terms|faq|delete-account)(/|$)";

export function isDocumentPage(pathname: string): boolean {
  return new RegExp(DOCUMENT_PAGE_PATTERN).test(pathname);
}
