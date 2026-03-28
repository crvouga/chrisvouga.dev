export const appendExternalLinkIndicator = ({
  text,
  fontSize = "0.8em",
  paddingLeft = "0.3em",
}: {
  text: string;
  fontSize?: string;
  paddingLeft?: string;
}): string => {
  return `${text}<span style="font-size: ${fontSize}; padding-left: ${paddingLeft}; text-decoration: none; display: inline-block;">↗</span>`;
};
