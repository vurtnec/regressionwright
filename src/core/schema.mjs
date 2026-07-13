export function validateJsonSchema(schema, value, path = '$') {
  const errors = [];
  validateNode(schema, value, path, errors);
  return errors;
}

export function assertJsonSchema(schema, value, label) {
  const errors = validateJsonSchema(schema, value);
  if (errors.length > 0) {
    throw new Error(`Schema validation failed for ${label}:\n${errors.map(error => `- ${error}`).join('\n')}`);
  }
}

export function assertPlanInput(plan, input) {
  for (const stage of plan.stages) {
    assertJsonSchema(
      stage.contract.inputSchema,
      stageInputValidationPayload(stage, input),
      `${stage.refId || stage.id} input`
    );
  }
}

export function assertStageInput(run, stageId) {
  const stage = findPlannedStage(run, stageId);
  assertJsonSchema(
    stage.contract.inputSchema,
    stageInputValidationPayload(stage, run.input),
    `${stageId} input`
  );
}

export function assertStageOutput(run, stageId) {
  const stage = findPlannedStage(run, stageId);
  assertJsonSchema(stage.contract.outputSchema, run, `${stageId} output`);
  if (stage.checks?.outputSchema) {
    assertJsonSchema(stage.checks.outputSchema, run, `${stageId} checks`);
  }
  return {
    contract: {
      id: stage.contract.id,
      path: stage.registry?.contractPath,
      status: 'passed',
    },
    checks: stage.checks
      ? {
          id: stage.checks.checks,
          path: stage.registry?.checkPath,
          status: 'passed',
        }
      : undefined,
  };
}

export function assertStageError(run, stageId, error) {
  const stage = findPlannedStage(run, stageId);
  assertJsonSchema(stage.contract.errorSchema, error, `${stageId} error`);
}

function findPlannedStage(run, stageId) {
  const stage = run.plan.stages.find(candidate => candidate.refId === stageId || candidate.id === stageId);
  if (!stage) {
    throw new Error(`Stage "${stageId}" is not present in the current plan.`);
  }
  return stage;
}

function stageInputValidationPayload(stage, input) {
  const stageInput = stageInputValue(stage, input);
  if (!stageInput.found) {
    return input;
  }

  return stageInput.value;
}

function stageInputValue(stage, input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { found: false };
  }

  const refId = stage.refId || stage.id;
  const stageInputs = input.stageInputs;
  if (stageInputs && typeof stageInputs === 'object' && !Array.isArray(stageInputs)) {
    const stageInput = stageInputs[refId];
    if (stageInput && typeof stageInput === 'object' && 'value' in stageInput) {
      return { found: true, value: stageInput.value };
    }
  }

  const dataKey = stage.registry?.dataKey;
  if (dataKey && Object.prototype.hasOwnProperty.call(input, dataKey)) {
    return { found: true, value: input[dataKey] };
  }

  return { found: false };
}

function validateNode(schema, value, path, errors) {
  if (!schema || typeof schema !== 'object') {
    return;
  }

  if (schema.const !== undefined && value !== schema.const) {
    errors.push(`${path} must equal ${JSON.stringify(schema.const)}.`);
  }

  if (schema.enum && !schema.enum.includes(value)) {
    errors.push(`${path} must be one of ${schema.enum.map(item => JSON.stringify(item)).join(', ')}.`);
  }

  if (schema.type && !matchesType(value, schema.type)) {
    errors.push(`${path} must be ${schema.type}, got ${typeOf(value)}.`);
    return;
  }

  if (schema.type === 'array' || schema.items) {
    if (!Array.isArray(value)) {
      errors.push(`${path} must be array, got ${typeOf(value)}.`);
      return;
    }

    if (schema.minItems !== undefined && value.length < schema.minItems) {
      errors.push(`${path} must contain at least ${schema.minItems} item(s).`);
    }
    if (schema.maxItems !== undefined && value.length > schema.maxItems) {
      errors.push(`${path} must contain at most ${schema.maxItems} item(s).`);
    }

    if (schema.items) {
      value.forEach((item, index) => validateNode(schema.items, item, `${path}[${index}]`, errors));
    }
  }

  if (schema.type === 'object' || schema.properties || schema.required) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      errors.push(`${path} must be object, got ${typeOf(value)}.`);
      return;
    }

    for (const key of schema.required || []) {
      if (value[key] === undefined) {
        errors.push(`${path}.${key} is required.`);
      }
    }

    for (const [key, childSchema] of Object.entries(schema.properties || {})) {
      if (value[key] !== undefined) {
        validateNode(childSchema, value[key], `${path}.${key}`, errors);
      }
    }
  }

  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      errors.push(`${path} length must be at least ${schema.minLength}.`);
    }
    if (schema.maxLength !== undefined && value.length > schema.maxLength) {
      errors.push(`${path} length must be at most ${schema.maxLength}.`);
    }
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) {
      errors.push(`${path} must match /${schema.pattern}/.`);
    }
    if (schema.format === 'uri' && !isUri(value)) {
      errors.push(`${path} must be a valid URI.`);
    }
    if (schema.format === 'date-time' && !isDateTime(value)) {
      errors.push(`${path} must be a valid date-time.`);
    }
  }

  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) {
      errors.push(`${path} must be greater than or equal to ${schema.minimum}.`);
    }
    if (schema.maximum !== undefined && value > schema.maximum) {
      errors.push(`${path} must be less than or equal to ${schema.maximum}.`);
    }
  }
}

function matchesType(value, expectedType) {
  if (expectedType === 'array') {
    return Array.isArray(value);
  }
  if (expectedType === 'object') {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }
  if (expectedType === 'integer') {
    return Number.isInteger(value);
  }
  return typeof value === expectedType;
}

function typeOf(value) {
  if (Array.isArray(value)) {
    return 'array';
  }
  if (value === null) {
    return 'null';
  }
  return typeof value;
}

function isUri(value) {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

function isDateTime(value) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp);
}
