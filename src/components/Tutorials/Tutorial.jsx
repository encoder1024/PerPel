import React, { useState } from 'react';
import { Joyride, STATUS } from 'react-joyride';

const TutorialGuide = ({ steps, run, setRun }) => {
  // Creamos un "contador" para la key
  const [tourKey, setTourKey] = useState(0);

  const handleJoyrideCallback = (data) => {
    const { status } = data;

    if ([STATUS.FINISHED, STATUS.SKIPPED].includes(status)) {
      setRun(false);
      // Incrementamos la key para que el próximo tour sea "nuevo"
      setTourKey(prev => prev + 1);
    }
  };

  return (
    <Joyride
      key={`joyride-${tourKey}`} // 👈 La clave del éxito
      steps={steps}
      run={run}
      continuous={true}
      showProgress={true}
      showSkipButton={true}
      callback={handleJoyrideCallback}
      // Quitamos stepIndex para que Joyride maneje su lógica interna
      styles={{
        options: {
          primaryColor: '#D4AF37',
          zIndex: 5000,
        },
      }}
    />
  );
};

export default TutorialGuide;
