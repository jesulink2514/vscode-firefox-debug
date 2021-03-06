import * as url from 'url';
import { ISourceActorProxy } from '../index';
import { SourceMapConsumer, Position, MappedPosition, NullablePosition, NullableMappedPosition, BasicSourceMapConsumer } from 'source-map';

let LEAST_UPPER_BOUND = SourceMapConsumer.LEAST_UPPER_BOUND;
let GREATEST_LOWER_BOUND = SourceMapConsumer.GREATEST_LOWER_BOUND;

export class SourceMappingInfo {

	public constructor(
		public readonly sources: ISourceActorProxy[],
		public readonly underlyingSource: ISourceActorProxy,
		public readonly sourceMapUri?: string,
		public readonly sourceMapConsumer?: BasicSourceMapConsumer,
		private readonly sourceRoot?: string
	) {}

	public generatedLocationFor(originalLocation: MappedPosition): NullablePosition {

		if (!this.sourceMapConsumer) {
			return { 
				line: originalLocation.line,
				column: originalLocation.column,
				lastColumn: null
			};
		}

		const originalSource = this.findUnresolvedSource(originalLocation.source);
		if (!originalSource) {
			throw 'Couldn\'t find original source';
		}

		let consumerArgs = Object.assign({ bias: LEAST_UPPER_BOUND }, originalLocation);
		consumerArgs.source = originalSource;
		let generatedLocation = this.sourceMapConsumer.generatedPositionFor(consumerArgs);

		if (generatedLocation.line === null) {
			consumerArgs.bias = GREATEST_LOWER_BOUND;
			generatedLocation = this.sourceMapConsumer.generatedPositionFor(consumerArgs);
		}

		if (this.underlyingSource.source.introductionType === 'wasm') {
			return { line: generatedLocation.column, column: 0, lastColumn: null };
		}

		return generatedLocation;
	}

	public originalLocationFor(generatedLocation: Position): NullableMappedPosition {

		if (!this.sourceMapConsumer) {
			return Object.assign({ source: this.sources[0]!.url, name: null }, generatedLocation);
		}

		let consumerArgs = Object.assign({ bias: GREATEST_LOWER_BOUND }, generatedLocation);

		if (this.underlyingSource.source.introductionType === 'wasm') {
			consumerArgs.column = consumerArgs.line;
			consumerArgs.line = 1;
		}

		let originalLocation = this.sourceMapConsumer.originalPositionFor(consumerArgs);

		if (originalLocation.line === null) {
			consumerArgs.bias = LEAST_UPPER_BOUND;
			originalLocation = this.sourceMapConsumer.originalPositionFor(consumerArgs);
		}

		if (originalLocation.source && this.sourceRoot) {
			originalLocation.source = url.resolve(this.sourceRoot, originalLocation.source);
		}

		if ((this.underlyingSource.source.introductionType === 'wasm') && originalLocation.line) {
			originalLocation.line--;
		}

		return originalLocation;
	}

	public syncBlackboxFlag(): void {

		if ((this.sources.length === 1) && (this.sources[0] === this.underlyingSource)) {
			return;
		}

		let blackboxUnderlyingSource = this.sources.every((source) => source.source.isBlackBoxed);
		if (this.underlyingSource.source.isBlackBoxed !== blackboxUnderlyingSource) {
			this.underlyingSource.setBlackbox(blackboxUnderlyingSource);
		}
	}

	public disposeSource(source: ISourceActorProxy): void {

		let sourceIndex = this.sources.indexOf(source);
		if (sourceIndex >= 0) {

			this.sources.splice(sourceIndex, 1);

			if (this.sources.length === 0) {
				this.underlyingSource.dispose();
			}
		}
	}

	private findUnresolvedSource(resolvedSource: string): string | undefined {
		if (!this.sourceMapConsumer) return undefined;

		for (const source of this.sourceMapConsumer.sources) {

			if ((source === resolvedSource) || 
				(this.sourceRoot && (url.resolve(this.sourceRoot, source) === resolvedSource))) {

				return source;
			}
		}

		return undefined;
	}
}
