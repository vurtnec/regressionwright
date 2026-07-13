export function parseCliOptions(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) {
      continue;
    }

    const equalIndex = arg.indexOf('=');
    if (equalIndex !== -1) {
      options[camelCaseOptionKey(arg.slice(2, equalIndex))] = arg.slice(equalIndex + 1);
      continue;
    }

    const key = camelCaseOptionKey(arg.slice(2));
    const nextValue = argv[index + 1];
    if (!nextValue || nextValue.startsWith('--')) {
      options[key] = true;
      continue;
    }

    options[key] = nextValue;
    index += 1;
  }
  return options;
}

export function camelCaseOptionKey(key) {
  return key.replace(/-([a-z0-9])/g, (_match, char) => char.toUpperCase());
}
