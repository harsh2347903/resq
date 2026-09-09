import React from 'react';
import { CustomTacticalMap } from './CustomTacticalMap';

export { CustomTacticalMap };
export function GoogleOperationsMap(props) {
  return <CustomTacticalMap {...props} />;
}
export default GoogleOperationsMap;
