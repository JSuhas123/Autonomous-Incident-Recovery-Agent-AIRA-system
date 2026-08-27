"use strict";


const {
  systemDnaContract,
} =
  require(
    "./systemDnaContract"
  );


class SystemDnaService {

  constructor(
    options = {}
  ) {
    this.contract =
      options.contract ||
      systemDnaContract;
  }


  build(
    input
  ) {
    const dna =
      this.contract
        .createDna(
          input
        );


    this.contract
      .assertSafeDna(
        dna
      );


    return dna;
  }
}


const systemDnaService =
  new SystemDnaService();


module.exports = {
  SystemDnaService,

  systemDnaService,

  buildSystemDna:
    systemDnaService
      .build
      .bind(
        systemDnaService
      ),
};