import { Link } from 'react-router-dom';
import { PageHeader } from '../components/ui';

export default function NotFound() {
  return (
    <>
      <PageHeader title="Page not found" subtitle="The page you were looking for doesn't exist or has been removed." />
      <Link to="/" className="btn">Back to dashboard</Link>
    </>
  );
}
