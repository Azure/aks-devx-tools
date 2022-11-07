export enum DraftFormat {
   Manifests = 'Manifests',
   Helm = 'Helm',
   Kustomize = 'Kustomize'
}

export const draftFormats = Object.keys(DraftFormat).map(
   (k) => DraftFormat[k as unknown as DraftFormat]
);
