export function inputForStage(run, stage, fallbackDataKey) {
  const input = run.input || {};
  const refId = stage?.refId || stage?.id;
  const stageInput = refId ? input.stageInputs?.[refId] : undefined;
  if (stageInput?.value !== undefined) {
    if (
      fallbackDataKey &&
      stageInput.value &&
      typeof stageInput.value === 'object' &&
      !Array.isArray(stageInput.value) &&
      Object.prototype.hasOwnProperty.call(stageInput.value, fallbackDataKey)
    ) {
      return stageInput.value[fallbackDataKey];
    }

    return stageInput.value;
  }

  const dataKey = stage?.registry?.dataKey || fallbackDataKey;
  if (dataKey && input[dataKey] !== undefined) {
    return input[dataKey];
  }

  throw new Error(
    `Missing stage input${refId ? ` for "${refId}"` : ''}${dataKey ? ` at input.${dataKey}` : ''}.`
  );
}
