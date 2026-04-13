import React from 'react';
import { Composition } from 'remotion';
import { MyComposition, myCompSchema } from './MyComposition';

export const RemotionRoot: React.FC = () => {
    return (
        <>
            <Composition
                id="MyComp"
                component={MyComposition}
                durationInFrames={30 * 15} // default 15s
                fps={30}
                width={1080}
                height={1920}
                schema={myCompSchema}
                defaultProps={{
                    elements: [],
                    totalDuration: 15,
                }}
            />
        </>
    );
};
