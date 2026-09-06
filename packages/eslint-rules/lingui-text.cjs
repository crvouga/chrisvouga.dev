/**
 * ESLint plugin: `<Text>` must use Lingui (`<Trans>` or `t` macro), not raw string literals.
 */
'use strict';

function isStringLiteralJsxAttrValue(attr) {
  if (attr.value?.type === 'Literal' && typeof attr.value.value === 'string') {
    return true;
  }
  if (
    attr.value?.type === 'JSXExpressionContainer' &&
    attr.value.expression.type === 'Literal' &&
    typeof attr.value.expression.value === 'string'
  ) {
    return true;
  }
  return false;
}

const ruleTextMustBeTrans = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Use `<Trans>` or `t` macro for `<Text label="...">` — no string literal in `label`.',
    },
    schema: [],
  },
  create(context) {
    return {
      JSXOpeningElement(node) {
        if (node.name?.type !== 'JSXIdentifier' || node.name.name !== 'Text') {
          return;
        }
        const labelAttr = node.attributes.find(
          (a) =>
            a.type === 'JSXAttribute' &&
            a.name.type === 'JSXIdentifier' &&
            a.name.name === 'label'
        );
        if (
          labelAttr?.type === 'JSXAttribute' &&
          isStringLiteralJsxAttrValue(labelAttr)
        ) {
          context.report({
            node: labelAttr,
            message:
              'Use `<Text label={<Trans>...</Trans>} />` or `label={t`...`}` instead of a string literal.',
          });
          return;
        }
      },
    };
  },
};

module.exports = {
  rules: {
    'text-must-be-trans': ruleTextMustBeTrans,
  },
};
