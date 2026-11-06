import { useNavigate } from 'react-router-dom';
import { WiseFunding } from '../components/funding/WiseFunding';
import { screenHref } from '../navigation';
export function FundingPage() {
 const navigate = useNavigate();
 return <><title>Get WISE | WiseOne | Garuda Extension</title><WiseFunding navigate={() => navigate(screenHref('trade'))}/></>;
}
