import { PlaceholderPage } from '../components/PlaceholderPage';

const content = {
  fund: { section: 'Get WISE', title: 'Get ready for your next position.', description: 'The WISE funding interface will be brought over from the existing app.' },
  problem: { section: 'The Problem', title: 'Your plans can change. Your stake’s term does not.', description: 'The existing guide to stake commitments and access to principal will be brought over here.' },
  how: { section: 'The Solution', title: 'Existing stakes. New possibilities.', description: 'The WISE, Signature stakes, and Garuda explanation will be brought over with its interactive cards.' },
  privacy: { section: 'CROPS', title: 'Your access should outlast this website.', description: 'Recovery tools and private connection controls will be brought over with their supporting integrations.' },
};

export function InformationPage({ screen }: { screen: keyof typeof content }) {
  return <PlaceholderPage {...content[screen]} placeholder="This page is being brought into the new app." />;
}
