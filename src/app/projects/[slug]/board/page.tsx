import { redirect } from 'next/navigation';

export default function BoardRedirectPage({ params }: { params: { slug: string } }) {
  redirect(`/projects/${params.slug}/checklist`);
}
