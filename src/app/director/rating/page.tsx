import { RatingDashboard } from "@/components/rating/rating-dashboard";
import { requireDirectorAccess } from "@/lib/director-auth";

export const dynamic = "force-dynamic";

type DirectorRatingPageProps = {
  searchParams?: Promise<{
    instructor?: string;
    rating?: string;
  }>;
};

export default async function DirectorRatingPage({
  searchParams,
}: DirectorRatingPageProps) {
  const [membership, params] = await Promise.all([
    requireDirectorAccess(),
    searchParams ? searchParams : Promise.resolve({}),
  ]);

  return (
    <RatingDashboard
      mode="director"
      membership={membership}
      searchParams={params}
    />
  );
}
