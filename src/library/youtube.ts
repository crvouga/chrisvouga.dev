export const toYouTubeVideoUrl = ({
  youTubeVideoId,
  autoplay = true,
  mute = true,
}: {
  youTubeVideoId: string;
  autoplay?: boolean;
  mute?: boolean;
}): string => {
  const params = new URLSearchParams();

  if (autoplay) {
    params.append("autoplay", "1");
  }

  if (mute) {
    params.append("mute", "1");
  }

  params.append("loop", "1");
  params.append("playlist", youTubeVideoId);

  return `https://www.youtube.com/embed/${youTubeVideoId}?${params.toString()}`;
};
