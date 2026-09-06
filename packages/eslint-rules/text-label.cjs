/**
 * ESLint plugin: enforce `label` on design-system `Text` outside `pkgs/ui/src/`.
 */
const UI_MODULE_SEGMENT = 'pkgs/ui/src/';

function hasLabelAttribute(openingElement) {
  return openingElement.attributes.some(
    (attr) =>
      attr.type === 'JSXAttribute' &&
      attr.name.type === 'JSXIdentifier' &&
      attr.name.name === 'label'
  );
}

function meaningfulJsxChildren(children) {
  return children.filter((child) => {
    if (child.type === 'JSXText') {
      return child.value.trim() !== '';
    }
    return true;
  });
}

const ruleTextUseLabel = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Use the `label` prop on `<Text>` instead of JSX children outside the design-system UI package.',
    },
    schema: [],
  },
  create(context) {
    const filename = context.filename ?? context.getFilename?.() ?? '';

    return {
      JSXElement(node) {
        if (!filename.includes(UI_MODULE_SEGMENT)) {
          const opening = node.openingElement;
          if (
            opening.name.type !== 'JSXIdentifier' ||
            opening.name.name !== 'Text'
          ) {
            return;
          }
          if (hasLabelAttribute(opening)) {
            return;
          }
          const kids = meaningfulJsxChildren(node.children);
          if (kids.length === 0) {
            return;
          }
          context.report({
            node: opening,
            message:
              'Use the `label` prop on `<Text>` instead of children (renamed imports like `<T>` are not checked).',
          });
        }
      },
    };
  },
};

module.exports = {
  rules: {
    'text-use-label': ruleTextUseLabel,
  },
};
