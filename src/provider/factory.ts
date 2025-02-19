import { fetchQwen } from './qwen.js';
import { fetchHyperbolic } from './hyperbolic.js';
import { fetchCursor } from './cursor.js';

export class ProviderFactory {
  static getProvider(model: string): Function {
    if (model.startsWith('qwen')) {
      return fetchQwen;
    }
    if (model.includes('/')) {
      return fetchHyperbolic;
    }
    return fetchCursor;
  }

  static getApiKeyForProvider(provider: Function): string {
    const apiKeys: Record<string, string> = {
        fetchQwen: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImIxOTQyZWExLWQyNWQtNDA2Mi1iYjI0LTA4NjY1OGZhYTliZiIsImV4cCI6MTc0MTg3NDQzN30.VhNKhyVGu_eHbVPoQ5cGa22F6yB-BVwbLI23s6iQHIE",
        fetchHyperbolic: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkaW5obmhhdG1pbmgubWluaGtoYW5oQGdtYWlsLmNvbSIsImlhdCI6MTczNzA0NjE1NX0.rJ4KxfZJlFY0oSxdChD-59dKaIFnCqs2sgYSn3aBgV4",
        fetchCursor: "https://api.cursor.com",
      };
      
    return apiKeys[provider.name] || '';
  }
}
