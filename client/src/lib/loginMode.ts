export function hasSuperLoginParameter(search: string) {
  return new URLSearchParams(search).has("super-login");
}
