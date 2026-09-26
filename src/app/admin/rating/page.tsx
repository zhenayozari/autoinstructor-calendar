import { RatingDashboard } from "@/components/rating/rating-dashboard";

export const dynamic = "force-dynamic";

type AdminRatingPageProps = {
  searchParams?: Promise<{
    rating?: string;
  }>;
};

export default async function AdminRatingPage({
  searchParams,
}: AdminRatingPageProps) {
  const params = searchParams ? await searchParams : {};

  return <RatingDashboard mode="instructor" searchParams={params} />;
}
