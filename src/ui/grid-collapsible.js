import { tag, text } from "../library/html/index.js";
import { viewButton } from "./button.js";
import { viewGrid, viewGridItem } from "./grid.js";
import { HEAD } from "./head.js";
import { unit } from "./theme.js";

/**
 * @type {import("../library/html/index.js").ViewWithProps<{
 *   jsVarSafeNamespace: string,
 *   children: import("../library/html/index.js").Html[],
 *   maxVisibleCardCount?: number
 * }>}
 */
export const viewGridCollapsible = (props) => () => {
  const maxVisibleCardCount = props.maxVisibleCardCount ?? 3;
  const namespace = `${props.jsVarSafeNamespace}--toggle-see-more--`;
  const rootId = `${namespace}root`;
  const hiddenCardClass = `${namespace}item-hidden`;
  const seeMoreButtonId = `${namespace}see-more-button`;
  const seeLessButtonId = `${namespace}see-less-button`;
  //
  const hiddenCardSelector = `.${hiddenCardClass}`;
  const seeMoreSelector = `#${seeMoreButtonId}`;
  const seeLessSelector = `#${seeLessButtonId}`;
  //
  const hiddenCardCount = Math.max(
    props.children.length - maxVisibleCardCount,
    0
  );

  const onClickToggleName = `${props.jsVarSafeNamespace}OnClickToggle`;

  return tag(
    "div",
    {
      id: rootId,
    },
    [
      tag("script", {}, [
        text(`       
        function ${onClickToggleName}(event) {
          const root = document.querySelector('#${rootId}');
          const isExpandedCurrent = root.getAttribute('data-expanded') === 'true';
          const isExpandedNew = !isExpandedCurrent;
          root.setAttribute('data-expanded', isExpandedNew);
          
          const seeMoreButton = document.querySelector('${seeMoreSelector}');
          const seeLessButton = document.querySelector('${seeLessSelector}');
          const hiddenCards = Array.from(document.querySelectorAll('${hiddenCardSelector}'));

          if (isExpandedNew) {
            root.setAttribute('data-scroll-position', window.scrollY);
            
            if(seeMoreButton) {
              seeMoreButton.style.display = 'none';
            }

            if(seeLessButton) {
              seeLessButton.style.display = 'block';
            }

            if(hiddenCards){
              hiddenCards.forEach((card) => {
                card.style.display = 'block';
              });
            }
          } else {
            if(seeMoreButton) {
              seeMoreButton.style.display = 'block';
            }

            if(seeLessButton) {
              seeLessButton.style.display = 'none';
            }

            if(hiddenCards){
              hiddenCards.forEach((card) => {
                card.style.display = 'none';
              });
            }
            
            const savedScrollPosition = parseInt(root.getAttribute('data-scroll-position') || '0');
            window.scrollTo({
              top: savedScrollPosition,
              behavior: 'instant'
            });
          }
        };
      `),
      ]),

      viewGrid(
        {},
        props.children.map((child, index) =>
          viewGridItem(
            index >= maxVisibleCardCount
              ? {
                  class: hiddenCardClass,
                  style: {
                    display: "none",
                  },
                }
              : {},
            [child]
          )
        )
      ),

      tag(
        "div",
        {
          class: "grid-collapsible-buttons",
          style: hiddenCardCount === 0 ? { display: "none" } : {},
        },
        [
          viewButton({
            disabled: false,
            size: "xl",
            startDecorator: null,
            tag: "button",
            text: `See ${hiddenCardCount.toLocaleString()} more`,
            variant: "contained",
          })({
            style: {
              width: "fit-content",
            },
            onclick: `${onClickToggleName}(event)`,
            id: seeMoreButtonId,
          }),

          viewButton({
            disabled: false,
            size: "xl",
            startDecorator: null,
            tag: "button",
            text: "See less",
            variant: "contained",
          })({
            style: {
              width: "fit-content",
              display: "none",
            },
            id: seeLessButtonId,
            onclick: `${onClickToggleName}(event)`,
          }),
        ]
      ),
    ]
  );
};

HEAD.push(
  tag("style", {}, [
    text(`
      .grid-collapsible-buttons {
        display: flex;
        align-items: center;
        justify-content: center;
        padding-top: ${unit(6)};
      }
    `),
  ])
);
