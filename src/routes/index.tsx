import { createFileRoute } from "@tanstack/react-router";
import { FollowDesk } from "@/components/follow-desk";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <FollowDesk />;
}
