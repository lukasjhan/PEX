import { Descriptor, InputDescriptorV1 } from '@sphereon/pex-models';
import jp from 'jsonpath';
import { nanoid } from 'nanoid';

import { Status } from '../../ConstraintUtils';
import { InternalVerifiableCredential } from '../../types';
import PEMessages from '../../types/Messages';
import {
  CredentialSchema,
  InternalPresentationDefinition,
  InternalPresentationDefinitionV1,
  PEVersion,
} from '../../types/SSI.types';
import { EvaluationClient } from '../evaluationClient';
import { HandlerCheckResult } from '../handlerCheckResult';

import { AbstractEvaluationHandler } from './abstractEvaluationHandler';

export class UriEvaluationHandler extends AbstractEvaluationHandler {
  constructor(client: EvaluationClient) {
    super(client);
  }

  public getName(): string {
    return 'UriEvaluation';
  }

  public handle(d: InternalPresentationDefinition, vcs: InternalVerifiableCredential[]): void {
    // This filter is removed in V2
    (<InternalPresentationDefinitionV1>d).input_descriptors.forEach((inDesc: InputDescriptorV1, i: number) => {
      const uris: string[] = d.getVersion() !== PEVersion.v2 ? inDesc.schema.map((so) => so.uri) : [];
      vcs.forEach((vc: InternalVerifiableCredential, j: number) => {
        const vcUris: string[] = UriEvaluationHandler.fetchVcUris(vc);
        this.evaluateUris(vcUris, uris, i, j, d.getVersion());
      });
    });
    const descriptorMap: Descriptor[] = this.getResults()
      .filter((e) => e.status === Status.INFO)
      .map((e) => {
        const inputDescriptor: InputDescriptorV1 = jp.nodes(d, e.input_descriptor_path)[0].value;
        return {
          id: inputDescriptor.id,
          format: 'ldp_vc',
          path: e.verifiable_credential_path,
        };
      });
    this.presentationSubmission = {
      id: nanoid(),
      definition_id: d.id,
      descriptor_map: descriptorMap,
    };
  }

  private evaluateUris(
    verifiableCredentialUris: string[],
    inputDescriptorsUris: string[],
    idIdx: number,
    vcIdx: number,
    pdVersion: PEVersion
  ): void {
    let hasAnyMatch = false;
    if (pdVersion === PEVersion.v1) {
      for (let i = 0; i < verifiableCredentialUris.length; i++) {
        if (inputDescriptorsUris.find((el) => el === verifiableCredentialUris[i]) != undefined) {
          hasAnyMatch = true;
        }
      }
    } else {
      hasAnyMatch = true;
    }
    if (hasAnyMatch) {
      this.getResults().push(
        this.createSuccessResultObject(verifiableCredentialUris, inputDescriptorsUris, idIdx, vcIdx)
      );
    } else {
      this.getResults().push(
        this.createErrorResultObject(verifiableCredentialUris, inputDescriptorsUris, idIdx, vcIdx)
      );
    }
  }

  private static fetchVcUris(vc: InternalVerifiableCredential) {
    const uris: string[] = [];
    if (Array.isArray(vc.getContext())) {
      uris.push(...vc.getContext());
    } else {
      uris.push(<string>vc.getContext());
    }
    if (Array.isArray(vc.getCredentialSchema()) && (vc.getCredentialSchema() as CredentialSchema[]).length > 0) {
      (vc.getCredentialSchema() as CredentialSchema[]).forEach((element) => uris.push(element.id));
    } else if (vc.getCredentialSchema()) {
      uris.push((vc.getCredentialSchema() as CredentialSchema).id);
    }
    return uris;
  }

  private createSuccessResultObject(
    verifiableCredentialUris: string[] | string,
    inputDescriptorsUris: string[],
    idIdx: number,
    vcIdx: number
  ) {
    const result: HandlerCheckResult = this.createResult(idIdx, vcIdx);
    result.status = Status.INFO;
    result.message = PEMessages.URI_EVALUATION_PASSED;
    result.payload = { verifiableCredentialUris, inputDescriptorsUris };
    return result;
  }

  private createErrorResultObject(
    verifiableCredentialUris: string[] | string,
    inputDescriptorsUris: string[],
    idIdx: number,
    vcIdx: number
  ) {
    const result = this.createResult(idIdx, vcIdx);
    result.status = Status.ERROR;
    result.message = PEMessages.URI_EVALUATION_DIDNT_PASS;
    result.payload = { verifiableCredentialUris, inputDescriptorsUris };
    return result;
  }
  private createResult(idIdx: number, vcIdx: number): HandlerCheckResult {
    return {
      input_descriptor_path: `$.input_descriptors[${idIdx}]`,
      verifiable_credential_path: `$[${vcIdx}]`,
      evaluator: this.getName(),
      status: Status.INFO,
      message: undefined,
    } as HandlerCheckResult;
  }
}
