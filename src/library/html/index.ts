export type Attrs = Record<
  string,
  string | number | Record<string, unknown> | undefined | null
>;

export type Tag = { t: "tag"; tagName: string; attrs: Attrs; children: Html[] };

export type Text = { t: "text"; text: string };

export type Fragment = { t: "fragment"; children: Html[] };

export type Html = Tag | Text | Fragment;

export type View = (attr?: Attrs, children?: Html[]) => Html;

export type ViewWithProps<Props> = (props: Props) => View;

export const tag = (
  tagName: string,
  attrs?: Attrs,
  children?: Html[],
): Html => {
  return {
    t: "tag",
    tagName,
    attrs: attrs ?? {},
    children: children ?? [],
  };
};

export const text = (text: string): Html => {
  return {
    t: "text",
    text,
  };
};

export const fragment = (children: Html[]): Html => {
  return {
    t: "fragment",
    children,
  };
};
