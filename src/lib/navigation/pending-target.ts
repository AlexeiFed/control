const externalProtocolPattern = /^[a-z][a-z0-9+.-]*:/i;

export function isPendingNavigationTarget(currentPathWithSearch: string, href: string): boolean {
  const target = href.trim();

  if (!target || target.startsWith("#") || externalProtocolPattern.test(target)) {
    return false;
  }

  if (!target.startsWith("/")) {
    return false;
  }

  const [targetPathWithSearch] = target.split("#");
  const [currentPath] = currentPathWithSearch.split("#");
  return targetPathWithSearch !== currentPath;
}
