import Box from "@material-ui/core/Box";
import Button from "@material-ui/core/Button";
import Card from "@material-ui/core/Card";
import CardActionArea from "@material-ui/core/CardActionArea";
import CardActions from "@material-ui/core/CardActions";
import CardContent from "@material-ui/core/CardContent";
import CardHeader from "@material-ui/core/CardHeader";
import Link from "@material-ui/core/Link";
import { makeStyles } from "@material-ui/core/styles";
import Typography from "@material-ui/core/Typography";
import CodeIcon from "@material-ui/icons/Code";
import LinkIcon from "@material-ui/icons/Link";

import React, { useState, useEffect } from "react";
import { IProject } from "../../../data-access/projects";

const useStyles = makeStyles(() => ({
  media: {
    position: "relative",
    height: 0,
    paddingTop: "75%",
  },
  card: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
  },
  content: {
    flex: 1,
  },
}));

const getScreenShot = async ({
  liveSiteUrl,
  timeout,
}: {
  liveSiteUrl: string;
  timeout?: number;
}) => {
  const response = await fetch(
    `/api/screenshot?targetUrl=${liveSiteUrl}&timeout=${timeout}`
  );

  const blob = await response.blob();

  const src = URL.createObjectURL(blob);

  return src;
};

export const ProjectCard = ({ project }: { project: IProject }) => {
  const { title, description, liveSiteUrl, sourceCodeUrl } = project;

  const classes = useStyles();

  const [src, setSrc] = useState<string | null>(null);
  const [, setState] = useState<"loading" | "success" | "error">("loading");

  useEffect(() => {
    setState("loading");

    getScreenShot({ liveSiteUrl, timeout: 5000 })
      .then((src) => {
        setSrc(src);
        setState("success");
      })
      .catch(() => {
        setState("error");
      });
  }, [liveSiteUrl]);

  return (
    <Card className={classes.card}>
      <CardHeader title={title} />

      <Link href={liveSiteUrl}>
        <CardActionArea>
          <Box className={classes.media}>
            {src && (
              <img
                src={src}
                alt={description}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: "100%",
                }}
              />
            )}
          </Box>
        </CardActionArea>
      </Link>

      <CardContent className={classes.content}>
        <Typography variant="body1" color="textSecondary">
          {description}
        </Typography>
      </CardContent>

      <CardActions>
        <Link href={liveSiteUrl}>
          <Button startIcon={<LinkIcon />} variant="outlined">
            Live Site
          </Button>
        </Link>
        <Link href={sourceCodeUrl}>
          <Button startIcon={<CodeIcon />} color="primary" variant="contained">
            Code
          </Button>
        </Link>
      </CardActions>
    </Card>
  );
};
